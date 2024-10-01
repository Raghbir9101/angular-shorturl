const express = require('express');
const dotenv = require("dotenv")
dotenv.config();
const app = express();
const path = require('path');
const cors = require("cors")
const geoip = require("geoip-lite");
const os_ = require("os");
const platform = require("platform");
const nodemailer = require('nodemailer');
const server = require('http').createServer(app);
const got = require('got');
const io = require('socket.io')(server, {
    cors: {
        origin: '*',
    }
});
const FormData = require("form-data");
const expressIp = require('express-ip');
app.use(expressIp().getIpInfoMiddleware);
const url = require('url');
const { uid } = require("uid")
const port = process.env.PORT || 80;
const { connection,
    UserModel,
    AllLinksModel, ClickDataModel, MessagesDataModel, OneTimeLinkModel } = require("./db");
const { default: axios } = require('axios');
const { authenticateToken } = require('./auth');
const cron = require("node-cron")

app.use(express.json({ limit: '50mb' }))
app.use(express.static("browser"));
app.use(express.static("images"));

app.use(cors())
io.on('connection', (socket) => {
    console.log('a user connected');
});
const secret = 'password';
const jwt = require('jsonwebtoken');
app.post("/api/signin", async (req, res) => {

    const { email, password, admin } = req.body;

    const user = await UserModel.findOne({ email });
    if (!user) {
        return res.json({ error: 'User Not Found' });
    }
    if (admin == true && user.isAdmin != true) {
        return res.json({ error: "The email is not Authorized for Admin Login !" })
    }
    if (user.password != password) {
        return res.json({ error: 'Password is Incorrect' });
    }
    const token = jwt.sign({ userId: user._id }, secret);
    return res.json({
        body: user,
        token
    });
})

function areLinksEqual(link1, link2) {
    // Prepend 'http://' if the scheme is missing
    link1 = link1.startsWith('http') ? link1 : 'http://' + link1;
    link2 = link2.startsWith('http') ? link2 : 'http://' + link2;

    // Create URL objects for the links
    const url1 = new URL(link1);
    const url2 = new URL(link2);
    // Compare the hostname and pathname of the URLs
    return (url1.hostname === url2.hostname) && (url1.pathname === url2.pathname);
}

function dateFix(dateString) {
    // Convert month abbreviation to numerical value
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthAbbreviation = dateString.split('-')[1];
    const monthIndex = months.indexOf(monthAbbreviation);
    const month = monthIndex !== -1 ? monthIndex : 0;

    // Extract components
    const [, day, year, time] = dateString.match(/(\d+)-([a-zA-Z]+)-(\d+) (\d+:\d+:\d+)/);
    const [hour, minute, second] = time.split(':');

    // Create a Date object
    const dateObject = new Date(year, month, day, hour, minute, second);
    return dateObject
}


function ensureHttps(link) {
    // Check if the link starts with "http://" or "https://"
    if (link.startsWith('http://')) {
        // Replace "http://" with "https://"
        return link.replace('http://', 'https://');
    } else if (!link.startsWith('https://')) {
        // If it doesn't start with "https://" or "http://", prepend "https://"
        return 'https://' + link;
    }

    // If the link already has "https://" or "http://", return it unchanged
    return link;
}

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const fs = require("fs")
app.get("/fixClicks", async (req, res) => {
    let clicks = fs.readFileSync('./clicks.json', 'utf8');
    clicks = JSON.parse(clicks);
    console.log(clicks.length)
    for (let i = 0; i < clicks.length; i++) {
        clicks[i].newshortURL = ensureHttps(clicks[i].shortURL);
    }
    let obj = {};
    let index = 1;
    for (let i of clicks) {
        let timestamp = new ObjectId(i._id.$oid).getTimestamp()
        if (obj[i.newshortURL]) {
            if (new Date(timestamp) > obj[i.newshortURL].timestamp) {
                obj[i.newshortURL].timestamp = new Date(timestamp);
            }
            obj[i.newshortURL].clicks++;
        }
        else {
            obj[i.newshortURL] = { clicks: 1, shortURL: i.newshortURL, index, timestamp: new Date(timestamp) }
        }
        index++
    }
    let allLinks = fs.readFileSync('./alllinks.json', 'utf8');
    allLinks = JSON.parse(allLinks)

    for (let i = 0; i < allLinks.length; i++) {
        allLinks[i].newshortURL = ensureHttps(allLinks[i].shortURL);
        let date = typeof allLinks[i].dateCreated == "object" ? allLinks[i].dateCreated.$date : allLinks[i].dateCreated
        let correctedDate
        try {
            correctedDate = new Date(date)
        }
        catch (err) {
            correctedDate = dateFix(date)
        }
        allLinks[i].clicks = obj[allLinks[i].newshortURL]?.clicks || 0

        allLinks[i].dateCreated = {
            $date: correctedDate
        }
        allLinks[i].lastUsed = {
            $date: obj[allLinks[i].newshortURL]?.timestamp || null
        }
    }
    let finalData = allLinks.sort((a, b) => b.clicks - a.clicks).map(item => {
        delete item.newshortURL
        return item
    })
    const jsonString = JSON.stringify(finalData, null, 2);
    fs.writeFileSync("./newLinks.json", jsonString)
    return res.send(jsonString)
})

// 

app.post('/cbxtest/send-otp', (req, res) => {

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'apps@ceoitbox.com',
            pass: 'bdrafmwnojwxijuu'
            // rltrixbvvpijzqvm
        }
    });
    const { otp_generator, userDetails, otpSettings } = req.body;
    userDetails['otp'] = otp_generator;
    let sendOTPTo = otpSettings[0];
    let subject = otpSettings[1];
    let body = otpSettings[2];

    sendOTPTo = removeTags(userDetails, sendOTPTo);
    subject = removeTags(userDetails, subject);
    body = removeTags(userDetails, body);
    let htmlData = ""
    let textData = ""

    if (body.includes("<") && body.includes(">")) {
        htmlData = body;
        textData = "";
    } else {
        htmlData = "";
        textData = body;
    }

    const mailOptions = {
        to: sendOTPTo,
        subject: subject,
        text: textData,
        html: htmlData
    };

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error)
            res.status(500).send('Error sending email');
        } else {
            const id = userDetails['Select Test'].match(/\/d\/(.+?)\//)[1];
            const percent = userDetails['Select Test'].split("|")[0].split("%%%%")[1];
            const response = {
                status: 'Email sent successfully',
                id,
                percent
            };
            res.status(200).send(response);
        }
    });
});




app.post("/shortenLink/:id", async (req, res) => {
    let data = req.body;
    if (!data.longURL) return res.send("Error Incorrect URL")
    let postData = {
        longURL: data.longURL,
        alias: data.alias || uid(5),
        remarks: data.remarks || "",
        userID: req.params.id,
        favourite: false,
        dateCreated: new Date(),
        clicks: 0,
    }
    try {
        const userData = await UserModel.findById(req.params.id);
        if (!userData.domain) {
            postData.shortURL = "https://cbxit.in/" + postData.alias;
        }
        else postData.shortURL = `https://${userData.domain}/` + postData.alias;
        const allLinksOfUser = await AllLinksModel.find({ userID: req.params.id, shortURL: postData.shortURL });
        console.log(allLinksOfUser)
        for (let i of allLinksOfUser) {
            if (i.shortURL.toLowerCase() == postData.shortURL.toLowerCase()) {
                return res.send({
                    error: "Link with same alias and domain already exists"
                })
            }
        }
        postData.domain == userData.domain || "";
        const database = new AllLinksModel(postData);
        await database.save()
        res.send(data.shortURL)
    }
    catch (err) {
        console.log(err)
    }
})






app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "browser", "index.html"));
})

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "browser", "index.html"));
})

app.get("/links", (req, res) => {
    res.sendFile(path.join(__dirname, "browser", "index.html"));
})

app.get("/client/:route", (req, res) => {
    res.sendFile(path.join(__dirname, "browser", "index.html"));
})

function addQueryParamsToLink(targetLink, queryObject) {
    // Parse the target link
    const targetUrl = new URL(targetLink);
    const targetParams = new URLSearchParams(targetUrl.search);

    // Add the query parameters from the query object to the target
    for (const key in queryObject) {
        if (queryObject.hasOwnProperty(key)) {
            targetParams.append(key, queryObject[key]);
        }
    }

    // Set the updated query parameters back to the target URL
    targetUrl.search = targetParams.toString();

    return targetUrl.toString();
}



app.get("/:alias", async (req, res) => {
    const alias = req.params.alias;
    try {
        const domain = `${req.get("Host")}/${alias}`.toLowerCase();
        const data = await AllLinksModel.findOne({ shortURL: { $regex: domain, $options: 'i' }, alias });
        if (!data) {
            // res.send({ message: `${domain} does not exist.` })
            return res.sendFile(path.join(__dirname, "index.html"));
        }
        let ipAddress = req.ipInfo.ip.split(",")
        let geo = geoip.lookup(ipAddress[0]);
        let info = platform.parse(req.headers["user-agent"]);
        let country = geo ? geo.country : "Unknown";
        let city = geo ? geo.city : "Unknown";
        let latitude = geo ? geo.ll[0] : "Unknown";
        let logitude = geo ? geo.ll[1] : "Unknown";

        let result = {
            city: city,
            country: country,
            latitude: latitude,
            longitude: logitude,
            browser: info.name + " " + info.version,
            os: info.os.family + " " + info.os.version,
            userID: "",
            shortURL: domain
        };

        let obj = {
            clicks: data.clicks + 1,
            lastUsed: new Date()
        }
        await AllLinksModel.findOneAndUpdate({ _id: data._id, }, obj);
        result.userID = data.userID;
        console.log(result)
        // let newData = new ClickDataModel(result);
        // await newData.save()
        let tempUserData = await UserModel.find({ _id: data.userID });

        const form_ = new FormData();
        form_.append("country", result.country);
        form_.append("city", result.city);
        form_.append("latitude", result.latitude);
        form_.append("logitude", result.longitude);
        form_.append("os_name", result.os);
        form_.append("browser", result.browser);
        form_.append("shortURL", result.shortURL);
        form_.append("userID", result.userID || "");

        if (tempUserData?.[0]?.googleSheetDeployLink) {
            axios.post(tempUserData[0].googleSheetDeployLink, form_)
        }
        io.emit('newClick', { result, obj });
        const externalLink = data.longURL.includes("http") ? data.longURL : `http://${data.longURL}`;

        let finalLink = addQueryParamsToLink(externalLink, req.query);
        res.redirect(finalLink)

    } catch (err) {
        console.log(err)
    }
})

app.post("/shorten/userExists", async (req, res) => {
    const { email } = req.body;
    try {
        const data = await UserModel.findOne({ email: email })
        console.log(email, data)
        res.send({ isUnique: !data })
    }
    catch (err) {
        console.log(err)
    }
})

app.post("/shorten/register", async (req, res) => {

    const data = { ...req.body };
    try {
        let prevData = await UserModel.find({ email: data.email });
        prevData = prevData[0];
        if (prevData) return res.send({ error: "User with this email already exists" });
        else {
            const member = new UserModel(data);
            await member.save();
            res.send(data);
        }
    } catch (err) {
        console.log(err)
        res.status(500).send("Internal Server Error");
    }
})
app.patch("/shorten/users/:id", async (req, res) => {
    try {
        const data = req.body;
        const id = req.params.id;
        const updatedObjet = await UserModel.findOneAndUpdate({ _id: id }, data);
        res.send(`Object with ID:${id} has been deleted`);
    }
    catch (err) {
        console.log(err)
    }
})

app.patch("/forgotpassword/users", async (req, res) => {
    try {
        const { email, password } = req.body;
        const id = req.params.id;
        const updatedObjet = await UserModel.findOneAndUpdate({ email }, {
            password
        });
        res.send(`Object with ID:${id} has been deleted`);
    }
    catch (err) {
        console.log(err)
    }
})



function generateOTP(length) {
    try {
        const chars = '0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    } catch (err) {
        console.log(err)
    }
}




app.post("/shorten/sendOtp", async (req, res) => {
    try {
        const { email } = req.body;
        const OTP = generateOTP(6);
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                // user: 'apps@ceoitbox.in',
                // pass: 'xnhrwhxmpkamzawt'
                user: 'apps@ceoitbox.com',
                pass: 'bdrafmwnojwxijuu'
            }
        });
        const mailOptions = {
            from: 'apps@ceoitbox.com',
            to: email,
            subject: 'SHORT URL OTP',
            text: 'Your SHORT URL OTP is ' + OTP
        };
        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });
        res.send(OTP)
    } catch (err) {
        console.log(err)
    }
})


app.post("/shorten/send/email", async (req, res) => {

    const { name, email, message } = req.body;
    console.log("apps@ceoitbox.com")
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: 'apps@ceoitbox.com',
            pass: 'bdrafmwnojwxijuu'
        }
    });
    const mailOptions1 = {
        from: 'apps@ceoitbox.com',
        to: email,
        subject: 'Confirmation Message',
        text: `You contacted with CBX it BOX. Your details are : 
            Name:${name},
            Email:${email},
            Message( Your Sent ) : ${message}
            `
    };

    transporter.sendMail(mailOptions1, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
    res.send({ message })

})


app.post("/shorten/users/uniqueCheck", async (req, res) => {
    const { email } = req.body;
    try {
        const data = await UserModel.findOne({ email });
        res.send({ isUnique: !data });
    }
    catch (err) {
        console.log(err);
    }
})

app.get("/link/checkvalidity/:alias", async (req, res) => {
    let { alias } = req.params;
    try {
        const query = req.query;
        const data = await OneTimeLinkModel.find({ alias });
        let isValid = false;
        for (let i of data) {
            if (i.count > 0) isValid = true;
        }
        res.send({ status: isValid ? "Valid" : "Expired" })
    }
    catch (err) {
        console.log(err)
    }

})

app.post("/oneTimeLink", async (req, res) => {
    const data = { ...req.body };
    if (!data.alias) data.alias = uid(4);
    console.log(data.alias);
    try {
        let prevData = await OneTimeLinkModel.findOne({ alias: data.alias, count: { $gt: 0 } });
        if (prevData) return res.send({ error: "Link with this alias already exists" });
        else {
            const newLink = new OneTimeLinkModel({
                longURL: data.longURL,
                shortURL: "https://cbxit.in/link/" + data.alias,
                count: data.count,
                alias: data.alias,
                dateCreated: new Date()
            });
            await newLink.save();
            res.send(newLink.shortURL);
        }
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal Server Error");
    }
})


app.get("/link/:alias", async (req, res) => {
    const alias = req.params.alias;
    try {
        const domain = `${req.get("Host")}/link/${alias}`.toLowerCase();
        const data = await OneTimeLinkModel.findOne({ shortURL: { $regex: domain, $options: 'i' }, alias, count: { $gt: 0 } });
        if (!data) {
            return res.send({ message: `${domain} does not exist or expired` })
        }
        if (data.count == 0) {
            return res.send("Link Expired")
        }
        let obj = {
            count: data.count - 1
        }

        await OneTimeLinkModel.findOneAndUpdate({ _id: data._id }, obj);

        const externalLink = data.longURL.includes("http") ? data.longURL : `http://${data.longURL}`;
        res.redirect(externalLink)

    } catch (err) {
        console.log(err)
    }
})


app.post('/createOrUpdateLinkWithSheetID', async (req, res) => {
    try {
        let { sheetID, longURL } = req.body;
        const linkExist = await AllLinksModel.findOne({ sheetID });
        // console.log(req.body, linkExist)

        if(linkExist && linkExist?.longURL == longURL) {
            return res.json({
                message: "Link already updated !",
                status: true,
                data: linkExist
            })
        }
        else if (linkExist && linkExist?.longURL != longURL) {
            let newDate = new Date();
            console.log(newDate.toISOString(), newDate.toDateString(), newDate.toTimeString())
            let updatedData = await AllLinksModel.findOneAndUpdate({ sheetID }, { longURL, dateCreated:newDate  },{
                new: true
            }).lean();
            updatedData = JSON.parse(JSON.stringify(updatedData));
            console.log(updatedData);
            res.json({
                message: "Link updated Successfully !",
                status: true,
                data: {...updatedData, dateCreated:newDate}
            })
            return
        }

        let alias = uid(5);
        let obj = {
            longURL,
            alias,
            // shortURL: "http://localhost:3001/" + alias,
            shortURL: "https://cbxit.in/" + alias,
            clicks: 0,
            dateCreated: new Date(),
            lastUsed: new Date(),
            sheetID
        }

        const createdData = await AllLinksModel.create(obj);
        res.json({
            message: "Link created Successfully !",
            status: true,
            data: createdData
        })
    } catch (error) {
        res.errored({
            message: error.message,
            status: false,
            error
        })
    }
})




app.use(authenticateToken)
// New URL create Unique Check EndPoint
app.post("/shorten/uniqueCheck", async (req, res) => {
    const { URL } = req.body;
    let alias = URL.split("/");
    alias = alias[alias.length - 1];
    try {
        const data = await AllLinksModel.findOne({ shortURL: { $regex: URL.slice(8).toLowerCase() }, alias })
        res.send({ isUnique: !data })
    }
    catch (err) {
        console.log(err)
    }
})

// UserModel EndPoint
app.get("/shorten/users", async (req, res) => {
    try {
        const query = req.query;
        const data = await UserModel.find(query)
        res.send(data)
    }
    catch (err) {
        console.log(err)
    }
})
app.get("/shorten/usersWithCredits", async (req, res) => {
    try {
        const query = req.query;
        const data = await UserModel.find(query).lean();
        for (let i = 0; i < data.length; i++) {
            const temp = await AllLinksModel.countDocuments({ _id: data[i]._id })
            let limit = await getLimit(data[i].email)
            data[i].creditsAllowed = limit;
            data[i].creditsRemaining = +limit - +temp;
            console.log(data[i].creditsAllowed, data[i].creditsRemaining,)
        }
        res.send(data)
    }
    catch (err) {
        console.log(err)
    }
})
app.get("/shorten/users/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const data = await UserModel.findById(id).lean();
        delete data.password
        res.send(data);
    }
    catch (err) {
        console.log(err)
    }

})
app.post("/shorten/users", async (req, res) => {
    try {
        const data = req.body;
        const database = new UserModel(data);

        console.log(await database.save())
        res.send(data)
    }
    catch (err) {
        console.log(err)
    }

})
app.delete("/shorten/users/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const deletedObject = await UserModel.findByIdAndDelete(id);
        res.send(`Object with ID:${id} has been deleted`);
    }
    catch (err) {
        console.log(err)
    }

})

// AllDataModel EndPoint

app.get("/shorten/AllData", async (req, res) => {
    try {
        const query = req.query;
        const data = await AllLinksModel.find(query)
        res.send(data)
    }
    catch (err) {
        console.log(err)
    }
})

async function getUserEmailToUserID() {
    let temp = await UserModel.find().lean();
    let emailToID = {};
    let IDToEmail = {};
    for (let i of temp) {
        emailToID[i.email] = i._id;
        IDToEmail[i._id] = i.email;
    }
    return [emailToID, IDToEmail]
}
function getMatchingIDorEmail(obj, search) {
    let arr = []
    for (let i in obj) {
        if (i.includes(search)) {
            arr.push(obj[i])
        }
    }
    return arr;
}

app.get("/shorten/AllData/pagination", async (req, res) => {
    try {
        const [emailToID, IDToEmail] = await getUserEmailToUserID()
        const { offset = 0, limit, filter, sort, search } = req.query;
        let query = {};
        let filterDate = new Date();
        filterDate.setDate(filterDate.getDate() - +filter);

        if (filter != 0 && filter != "NOT") {
            query = {
                lastUsed: {
                    $lt: filterDate
                }
            }
        }
        if (filter == "NOT") {
            query = {
                ...query,
                lastUsed: { $not: { $type: "date" } }
            }
        }

        query = {
            ...query,
            $or: [{ shortURL: { $regex: search || "" } }, {
                $or: [...getMatchingIDorEmail(emailToID, search).map(item => ({ userID: item }))]
            }]
        }
        let sortObj = {};
        if (sort.endsWith("CLICKS")) {
            sortObj.clicks = sort.startsWith("ASC") ? 1 : -1
        }
        else if (sort.endsWith("LAST")) {
            sortObj.lastUsed = sort.startsWith("ASC") ? 1 : -1
        }
        else if (sort.endsWith("CREATED")) {
            sortObj.dateCreated = sort.startsWith("ASC") ? 1 : -1
        }

        const [data, totalCount] = await Promise.all([
            AllLinksModel.find(query).sort(sortObj).lean()
                .skip(Number(offset))
                .limit(Number(limit)),
            AllLinksModel.countDocuments(query),
        ]);

        res.json({
            data: data.map(item => ({ ...item, email: IDToEmail[item.userID] })),
            totalRows: totalCount,
        });
    } catch (err) {
        console.error(err);  // Log the specific error
        res.status(500).json({ error: err.message });  // Return the error message in the response
    }

});


app.get("/shorten/AllData/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const data = await AllLinksModel.findById(id);
        res.send(data);
    }
    catch (err) {
        console.log(err)
    }

})
app.post("/shorten/AllData", async (req, res) => {
    try {
        const data = req.body;
        const database = new AllLinksModel(data);
        await database.save()
        res.send(database)
    }
    catch (err) {
        console.log(err)
    }
})
app.delete("/shorten/AllData/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const deletedObject = await AllLinksModel.findByIdAndDelete(id);
        res.send(`Object with ID:${id} has been deleted`);
    }
    catch (err) {
        console.log(err)
    }
})
app.post("/shorten/AllData/bulkDelete", async (req, res) => {
    if (!req.user.isAdmin) return res.send({ error: "Unauthorized Access !" })
    try {
        const ids = req.body.ids || [];
        const deletedObject = await AllLinksModel.deleteMany({ _id: { $in: ids.map(item => item._id) } })
        let uniqueUserIDs = [...new Set(ids.map(item => item.userID))]
        const users = await UserModel.find(mongooseOrObj("_id", uniqueUserIDs))

        for (let i of users) {
            let _id = i._id;
            let deleteURLs = ids.filter(item => item.userID == _id).map(ele => ele.shortURL);

            sendMail(deleteURLs, i.email)

        }

        res.send(`Object with IDs:${ids.join()} has been deleted`);
    }
    catch (err) {
        console.log(err)
    }
})

function sendMail(urls, email) {
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: 'apps@ceoitbox.com',
            pass: 'bdrafmwnojwxijuu'
        }
    });
    const mailOptions1 = {
        from: 'apps@ceoitbox.com',
        to: email,
        subject: 'SHORT URL Update',
        html: `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Deleted Short URLs</title>
            <style>
                body {
                    font-family: 'Arial', sans-serif;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 20px;
                    text-align: center;
                }
        
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background-color: #fff;
                    padding: 20px;
                    border-radius: 10px;
                    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                }
        
                h1 {
                    color: #333;
                }
        
                p {
                    color: #555;
                }
        
                code {
                    display: block;
                    background-color: #f8f8f8;
                    padding: 10px;
                    margin: 10px 0;
                    border-radius: 5px;
                    overflow-x: auto;
                }
            </style>
        </head>
        <body>
        
            <div class="container">
                <h1>Deleted Short URLs</h1>
                <p>The administrator has deleted the short URLs that were generated but remained unused for an extended period.</p>
                
                <p>Deleted SHORT URLs:</p>
                <code>${urls.join('\n')}</code>
            </div>
        
        </body>
        </html>
        
        `
    };

    transporter.sendMail(mailOptions1, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}

app.patch("/shorten/AllData/:id", async (req, res) => {
    try {
        const data = req.body;
        const id = req.params.id;
        const updatedObjet = await AllLinksModel.findOneAndUpdate({ _id: id }, data);
        res.send(`Object with ID:${id} has been deleted`);
    }
    catch (err) {
        console.log(err)
    }

})


function mongooseOrObj(param, arr) {
    let temp = [];
    for (let i of arr) {
        temp.push({ [param]: i })
    }
    return {
        $or: temp
    }
}


// messages EndPoint

app.get("/shorten/messages", async (req, res) => {
    try {
        const query = req.query;
        const data = await MessagesDataModel.find(query)
        res.send(data)
    }
    catch (err) {
        console.log(err)
    }

})
app.get("/shorten/messages/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const data = await MessagesDataModel.findById(id);
        res.send(data);
    }
    catch (err) {
        console.log(err)
    }

})

app.post("/shorten/messages", async (req, res) => {
    try {
        const data = req.body;
        const database = new MessagesDataModel(data);
        await database.save()
        res.send(data)
    }
    catch (err) {
        console.log(err)
    }

})


//clicks

app.get("/shorten/clicks", async (req, res) => {
    try {
        const query = req.query;
        const data = await ClickDataModel.find(query)
        res.send(data)
    } catch (err) {
        console.log(err)
    }

})
app.get("/shorten/clicksWithCount", async (req, res) => {
    try {
        const query = req.query;
        const data = await ClickDataModel.find(query).lean()
        let obj = {};

        for (let i = 0; i < data.length; i++) {
            if (obj[`${data[i].latitude}-${data[i].longitude}-${data[i].shortURL}`]) {
                obj[`${data[i].latitude}-${data[i].longitude}-${data[i].shortURL}`].count++
            }
            else obj[`${data[i].latitude}-${data[i].longitude}-${data[i].shortURL}`] = {
                ...data[i], count: 1
            }
        }

        res.send(Object.values(obj))
    } catch (err) {
        console.log(err)
    }

})
app.patch("/shorten/clicks/:id", async (req, res) => {
    try {
        if (req.params.id) return res.send("Undefined ID Error")
        const data = req.body;
        const id = req.params.id;
        console.log(id)
        const updatedObjet = await ClickDataModel.findOneAndUpdate({ _id: id }, data);
        res.send(`Object with ID:${id} has been deleted`);
    }
    catch (err) {
        console.log(err)
    }
})

async function getLimit({ email }) {
    const response = await got(
        "http://auth.ceoitbox.com/checkauth/CBX1221SURL01/" +
        email +
        "/CBX1221SURL01-SHORTURLSITE/NA/NA"
    );
    const body_ = JSON.parse(response.body);
    let limit = 0;
    if (body_.valid == "Active") {
        if (body_.version == "basic") {
            limit = 500;
        }
        if (body_.version == "pro") {
            limit = 5000;
        }
    } else {
        limit = 500;
    }
    return limit
}

app.post("/shorten/licenceCheck", async (req, res) => {
    const { email } = req.body;
    const response = await got(
        "http://auth.ceoitbox.com/checkauth/CBX1221SURL01/" +
        email +
        "/CBX1221SURL01-SHORTURLSITE/NA/NA"
    );
    const body_ = JSON.parse(response.body);
    let limit = 0;
    if (body_.valid == "Active") {
        if (body_.version == "basic") {
            limit = 500;
        }
        if (body_.version == "pro") {
            limit = 5000;
        }
    } else {
        limit = 500;
    }
    res.send({ limit })
})

app.delete("/shorten/clicks/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const deletedObject = await ClickDataModel.findByIdAndDelete(id);
        res.send(`Object with ID:${id} has been deleted`);
    } catch (err) {
        console.log(err)
    }

})
// {
//     longURL: String,
//         alias: String,
// }

cron.schedule('0 0 * * 0', async () => {
    axios.get("https://auth.ceoitbox.com/sendlogs").then(res => console.log(res.data));
    console.log('Running getLast7DaysData cron job...');
});
server.listen(port, async () => {
    try {
        await connection
        console.log("Connected to db")
    } catch (err) {
        console.log(err)
    }
    console.log("Server Started at PORT", port)
})




function removeTags(userDetails, text) {
    // iterate over the keys of the object
    Object.keys(userDetails).forEach((key) => {
        // replace each tag in the text with its corresponding value
        const tag = `<<${key}>>`;
        if (tag == '<<Select Test>>') {
            const value = userDetails[key];
            text = text.replace(tag, value.split('|')[1]);
        } else {
            const value = userDetails[key];
            text = text.replace(tag, value);
        }
    });
    return text;
}
