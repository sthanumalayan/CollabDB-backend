import mongoose from "mongoose";
const userschema=new mongoose.Schema({
    username:String,
    upiID:String,
    password:String,
    userID:String,
    groups:Array
},{ collection: 'Authentication' });

export const user=mongoose.model('user',userschema);