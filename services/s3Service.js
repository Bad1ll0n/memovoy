const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const crypto = require('crypto');
require("dotenv").config();

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

// Função para processar e enviar
const processAndUploadFiles = async (files) => {
    if (!files || files.length === 0) return [];

    const uploadPromises = files.map(async (file) => {
        const randomName = crypto.randomBytes(16).toString('hex');
        const fileName = `posts/${randomName}.webp`;

        const optimizedBuffer = await sharp(file.buffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .toFormat('webp', { quality: 80 })
            .toBuffer();

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileName,
            Body: optimizedBuffer,
            ContentType: 'image/webp',
        };
        
        await s3.send(new PutObjectCommand(uploadParams));
        return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    });

    return await Promise.all(uploadPromises);
};

module.exports = { processAndUploadFiles };