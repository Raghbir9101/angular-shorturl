const mongoose = require("mongoose");
const dotenv = require("dotenv")
dotenv.config();
// const connection = mongoose.connect("mongodb://localhost:27017/ceoitbox");
const connection = mongoose.connect(process.env.MONGO_URL);
// const connection = mongoose.connect("mongodb+srv://apiglobal37:apiglobal37@cluster0.h3reutl.mongodb.net/linkShortner");

const userSchema = mongoose.Schema({
    firstName: String,
    lastName: String,
    email: String,
    password: String,
    domain: String,
    isAdmin: Boolean,
    googleSheetDeployLink: String,
    createLimit: Number,
    createLimitDate: mongoose.Schema.Types.Mixed
})

const allLinksSchema = mongoose.Schema({
    longURL: String,
    alias: String,
    shortURL: String,
    remarks: String,
    clicks: Number,
    userID: String,
    favourite: Boolean,
    dateCreated: Object,
    lastUsed: Object,
    sheetID: String
})

const clickDataSchema = mongoose.Schema({
    city: String,
    country: String,
    latitude: String,
    longitude: String,
    browser: String,
    os: String,
    userID: String,
    shortURL: String
})
const messagesData = mongoose.Schema({
    name: String,
    email: String,
    message: String,
})

const oneTimeLinkSchema = mongoose.Schema({
    longURL: String,
    alias: String,
    shortURL: String,
    dateCreated: Object,
    count: Number
})


const UserModel = mongoose.model("user", userSchema);
const AllLinksModel = mongoose.model("newAllLinks", allLinksSchema);
// const AllLinksModel = mongoose.model("AllLinks", allLinksSchema);
const ClickDataModel = mongoose.model("clicks", clickDataSchema);
const MessagesDataModel = mongoose.model("messages", messagesData);
const OneTimeLinkModel = mongoose.model("OneTimeLink", oneTimeLinkSchema);

module.exports = {
    connection,
    UserModel,
    AllLinksModel,
    ClickDataModel,
    MessagesDataModel,
    OneTimeLinkModel
}