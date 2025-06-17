// import mongoose from "mongoose";
// const groupschema=new mongoose.Schema({
//     name:String,
//     url:String,
//     description:String,
//     groupID:String,
//     members:Array,
// },{collection:'Groups'});

// export const group=mongoose.model('group',groupschema);

import mongoose from "mongoose";

const groupschema = new mongoose.Schema({
  name: String,
  url: String,
  description: String,
  groupID: String,
  members: [String], // array of userIDs

  paymentMatrix: {
    type: Map,
    of: {
      type: Map,
      of: Number, // amount owed (in rupees or paise)
    },
    default: {}, // initialize as empty object
  }

}, { collection: 'Groups' });

export const group = mongoose.model('group', groupschema);
