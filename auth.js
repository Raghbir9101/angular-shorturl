const jwt = require('jsonwebtoken');
const { UserModel } = require('./db');
const secret = 'password';
exports.authenticateToken = (req, res, next) => {
    const authHeader = req?.headers?.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res?.sendStatus(401);
    
    jwt.verify(token, secret, async (err, decoded) => {

        if (err) return res.sendStatus(403);
        const user = await UserModel.findById(decoded.userId);
        if (!user) return res.sendStatus(404);
        req.user = user;
        next();
    });
}