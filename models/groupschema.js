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
    of: Map,
    default: ()=>new Map()
  }


}, { collection: 'Groups' });

export const group = mongoose.model('group', groupschema);
