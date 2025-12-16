const Homey = require('homey');
const crypto = require('crypto');

exports.sleep = async function (ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

exports.encrypt = function (text) {
    const algorithm = 'aes-256-ctr';
    const secretKey = Homey.env.SECRET;
    const secret = secretKey;
    const iv = crypto.randomBytes(16); // per-call IV, avoids a pinned global buffer and fixes security
    const cipher = crypto.createCipheriv(algorithm, secret, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return `${iv.toString('hex')}+${encrypted.toString('hex')}`;
};

exports.decrypt = function (hash) {
    if (hash === null) {
        return hash;
    }

    const algorithm = 'aes-256-ctr';
    const secretKey = Homey.env.SECRET;
    const secret = secretKey;
    const splittedHash = hash.split('+');
    const decipher = crypto.createDecipheriv(algorithm, secret, Buffer.from(splittedHash[0], 'hex'));

    const decrpyted = Buffer.concat([decipher.update(Buffer.from(splittedHash[1], 'hex')), decipher.final()]);

    return decrpyted.toString();
};
