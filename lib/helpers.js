const Homey = require("homey");
const crypto = require("crypto");

const algorithm = "aes-256-ctr";

function getSecretKey() {
  const secret = Homey.env.SECRET || "com.eufylife.home-fallback-secret";
  return crypto.createHash("sha256").update(String(secret)).digest();
}

exports.sleep = async function (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

exports.encrypt = function (text) {
    if (text === null || typeof text === "undefined") {
      return text;
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, getSecretKey(), iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return `${iv.toString('hex')}+${encrypted.toString('hex')}`;
};

exports.decrypt = function (hash) {
    if(hash === null || typeof hash === "undefined") {
         return hash;
    }

    if (typeof hash !== "string" || !hash.includes('+')) {
        return hash;
    }

    try {
        const splittedHash = hash.split('+');
        const decipher = crypto.createDecipheriv(algorithm, getSecretKey(), Buffer.from(splittedHash[0], 'hex'));

        const decrpyted = Buffer.concat([decipher.update(Buffer.from(splittedHash[1], 'hex')), decipher.final()]);

        return decrpyted.toString();
    } catch (error) {
        return hash;
    }
};
