import express from "express";
import mongoose from "mongoose";
import { nanoid } from "nanoid";
import cors from "cors";
import QRCode from "qrcode";
import { user } from "./models/userschema.js";
import { group } from "./models/groupschema.js";


const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({
  origin: "*", 
  credentials: true
}));

// ----------------- ROUTES -----------------

app.post('/signup', async (req, res) => {
  const checkUser = await user.findOne({ username: req.body.username });
  if (checkUser) return res.status(401).json({ error: 'Username already taken!' });

  const newUser = new user({
    username: req.body.username,
    upiID: req.body.upiId,
    password: req.body.password,
    userID: nanoid(6),
    groups: [],
  });

  await newUser.save();
  res.status(201).json({ message: 'User created successfully' });
});

app.post('/login', async (req, res) => {
  const { user: username, password } = req.body;
  const foundUser = await user.findOne({ username });
  if (!foundUser || foundUser.password !== password) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  res.json({ message: 'Login successful', username: foundUser.username });
});

app.post('/create', async (req, res) => {
  const User = await user.findOne({ username: req.body.username });
  const paymentMatrix = {
    [User.userID]: {}
  };

  const newGroup = new group({
    name: req.body.group,
    url: req.body.imgurl,
    description: req.body.description,
    groupID: nanoid(6),
    members: [User.username],
    paymentMatrix,
  });

  User.groups.push(newGroup.groupID);
  await User.save();
  await newGroup.save();
  res.json({ newGroup });
});

app.post('/groups', async (req, res) => {
  const groups = await group.find({});
  res.status(200).json(groups);
});

app.post('/view', async (req, res) => {
  const User = await user.findOne({ username: req.body.username });
  if (!User) return res.status(404).json({ error: 'User not found' });

  const groupids = User.groups;
  const groups = [];

  for (let id of groupids) {
    const currgrp = await group.findOne({ groupID: id });
    if (currgrp) groups.push(currgrp);
  }

  res.json({ groups });
});

app.post('/join', async (req, res) => {
  const Group = await group.findOne({ groupID: req.body.group.groupID });
  const User = await user.findOne({ username: req.body.username });

  if (!Group || !User) return res.status(404).json({ error: 'Invalid group or user' });

  if (Group.members.includes(User.username)) {
    return res.status(200).json({ alreadyJoined: true, group: Group });
  }

  const newUserID = User.userID;

  // Initialize paymentMatrix entries for the new user
  if (!Group.paymentMatrix.has(newUserID)) {
    Group.paymentMatrix.set(newUserID, new Map());
  }

  for (let member of Group.members) {
    const m = await user.findOne({ username: member });
    if (!m) continue;

    const existing = Group.paymentMatrix.get(m.userID) || new Map();
    existing.set(newUserID, 0);
    Group.paymentMatrix.set(m.userID, existing);

    const newUserEntry = Group.paymentMatrix.get(newUserID);
    newUserEntry.set(m.userID, 0);
    Group.paymentMatrix.set(newUserID, newUserEntry);
  }

  Group.members.push(User.username);
  User.groups.push(Group.groupID);

  await User.save();
  await Group.save();

  res.status(200).json({ alreadyJoined: false, group: Group });
});

app.post('/expense', async (req, res) => {
  const { amount, selectedMembers, username, groupId } = req.body;

  if (!amount || !selectedMembers || !username || !groupId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const payer = await user.findOne({ username });
  const groupDoc = await group.findOne({ groupID: groupId });

  if (!payer || !groupDoc) return res.status(404).json({ error: 'User or group not found' });

  const payerID = payer.userID;
  const splitAmount = parseFloat(amount) / selectedMembers.length;

  for (const mem of selectedMembers) {
    if (mem === username) continue;
    const m = await user.findOne({ username: mem });
    if (!m) continue;

    const memberID = m.userID;

    // Initialize nested maps
    if (!groupDoc.paymentMatrix.has(memberID)) {
      groupDoc.paymentMatrix.set(memberID, new Map());
    }

    const memberMap = groupDoc.paymentMatrix.get(memberID);
    const current = memberMap.get(payerID) || 0;
    memberMap.set(payerID, current + splitAmount);

    groupDoc.paymentMatrix.set(memberID, memberMap);
  }

  await groupDoc.save();
  res.status(200).json({ message: 'Expense recorded and dues updated' });
});



app.post('/dues', async (req, res) => {
  const { groupId, from, to } = req.body;

  const fromUser = await user.findOne({ username: from });
  const toUser = await user.findOne({ username: to });
  const grp = await group.findOne({ groupID: groupId });

  if (!fromUser || !toUser || !grp) {
    return res.status(404).json({ error: 'Missing or invalid users/group' });
  }

  const fromID = fromUser.userID;
  const toID = toUser.userID;

  const amount = grp.paymentMatrix?.get(fromID)?.get(toID) || 0;

  const upiUrl = `upi://pay?pa=${toUser.upiID}&pn=${encodeURIComponent(toUser.username)}&am=${amount}&cu=INR`;
  const qrDataUrl = await QRCode.toDataURL(upiUrl);

  res.status(200).json({ amount, qr: qrDataUrl });
});


// ----------------- START SERVER -----------------

mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log("✅ Connected to MongoDB");
  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
  });
}).catch((err) => {
  console.error("❌ MongoDB connection failed:", err);
});
