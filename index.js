import express from "express"
import mongoose from "mongoose"
import { nanoid } from "nanoid"
import {user} from "./models/userschema.js"
import {group} from "./models/groupschema.js"
import cors from "cors";
import {MongoClient} from 'mongodb'
import QRCode from 'qrcode'
await mongoose.connect('mongodb://localhost:27017/CollabDB')

const uri = "mongodb://localhost:27017"; 
const client = new MongoClient(uri);
const dbName = "CollabDB"; 
await client.connect();
const db = client.db(dbName);
const groupsCollection = db.collection("Groups");

const app = express();
const port = 3000
app.use(express.json());
app.use(cors());

app.post('/signup',async (req,res)=>{
    const checkUser=await user.findOne({username:req.body.username});
    if(checkUser!=null){
      res.status(401).json({error:'Username already taken!'});
      return;
    }
    const newUser=new user({
        username:req.body.username,
        upiID:req.body.upiId,
        password:req.body.password,
        userID:nanoid(6),
        groups:[],
    });
    await newUser.save();
    console.log(newUser);
    res.status(201).send({ message: 'User created successfully' });
})

app.post('/login',async (req,res)=>{
    const username=req.body.user;
    const password=req.body.password;
    const newUser=await user.findOne({username:username});
    if (newUser.password !== password) {
      return res.status(401).json({ message: 'Incorrect password' });
    }
    res.json({ message: 'Login successful', username:newUser.username});
})

app.post('/create',async (req,res)=>{
    const paymentMatrix = new Map();
    const User=await user.findOne({username:req.body.username});
    paymentMatrix.set(User.userID, new Map());
    const newGroup=new group({
        name:req.body.group,
        url:req.body.imgurl,
        description:req.body.description,
        groupID:nanoid(6),
        members:[User.username],
        paymentMatrix:paymentMatrix,
    });
    User.groups.push(newGroup.groupID);
    await User.save();
    await newGroup.save();
    res.json({newGroup});
    console.log('group created successfully');
})

app.post('/groups',async (req,res)=>{
    const groups = await groupsCollection.find({}).toArray();
    res.status(200).json(groups);
})
app.post('/view', async (req, res) => {
  try {
    const User = await user.findOne({ username: req.body.username });
    if (!User) return res.status(404).json({ error: 'User not found' });

    const groupids = User.groups;
    let groups = [];

    for (let id of groupids) {
      const currgrp = await group.findOne({ groupID: id });
      if (currgrp) groups.push(currgrp);
    }

    res.json({ groups });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/join', async (req, res) => {
  const Group = await group.findOne({ groupID: req.body.group.groupID });
  const User = await user.findOne({ username: req.body.username });

  if (Group.members.includes(User.username)) {
    return res.status(200).json({ alreadyJoined: true, group: Group });
  }

  const existingMatrix = Group.paymentMatrix || new Map();
  existingMatrix.set(User.userID, new Map());

  for (const [memberID, debtsMap] of existingMatrix.entries()) {
    if (memberID !== User.userID) {
      debtsMap.set(User.userID, 0);
      existingMatrix.get(User.userID).set(memberID, 0);
    }
  }

  User.groups.push(req.body.group.groupID);
  Group.members.push(User.username);
  await User.save();
  await Group.save();

  res.status(200).json({ alreadyJoined: false, group: Group });
});

app.post('/expense', async (req, res) => {
  try {
    const { amount, selectedMembers, username, groupId } = req.body;

    if (!amount || !selectedMembers || !username || !groupId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const userDoc = await user.findOne({ username });
    if (!userDoc) return res.status(404).json({ error: 'User not found' });
    const userid = userDoc.userID;

    const splitAmount = parseFloat(amount) / selectedMembers.length;

    const grp = await group.findOne({ groupID: groupId });
    if (!grp) return res.status(404).json({ error: 'Group not found' });

    // Initialize Map if needed
    if (!grp.paymentMatrix) {
      grp.paymentMatrix = new Map();
    }

    for (const memberUsername of selectedMembers) {
      if (memberUsername === username) continue;

      const memberDoc = await user.findOne({ username: memberUsername });
      if (!memberDoc) continue; // skip if user not found
      const memberID = memberDoc.userID;

      if (!grp.paymentMatrix.has(memberID)) {
        grp.paymentMatrix.set(memberID, new Map());
      }

      const owesMap = grp.paymentMatrix.get(memberID);
      const current = owesMap.get(userid) || 0;
      owesMap.set(userid, current + splitAmount);
    }

    await grp.save();
    return res.status(200).json({ message: 'Expense recorded and dues updated' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});


app.post('/dues', async (req, res) => {
  try {
    const { groupId, from, to } = req.body;

    if (!groupId || !from || !to) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const fromUser = await user.findOne({ username: from });
    const toUser = await user.findOne({ username: to });

    if (!fromUser || !toUser) {
      return res.status(404).json({ error: 'User(s) not found' });
    }

    const grp = await group.findOne({ groupID: groupId });
    if (!grp || !grp.paymentMatrix) {
      return res.status(404).json({ error: 'Group or payment data not found' });
    }

    const owesMap = grp.paymentMatrix.get(fromUser.userID);
    const amount = owesMap?.get(toUser.userID) || 0;

    const upiUrl = `upi://pay?pa=${toUser.upiID}&pn=${encodeURIComponent(toUser.username)}&am=${amount}&cu=INR`;
    const qrDataUrl = await QRCode.toDataURL(upiUrl);

    return res.status(200).json({ amount, qr: qrDataUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});



app.listen(port,()=>{
    console.log(`Example app listening on port ${port}`)
})
