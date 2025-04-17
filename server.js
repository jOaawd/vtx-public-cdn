require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { B2 } = require('b2-sdk');

const app = express();
const PORT = 3000;

const b2 = new B2({
  accountId: process.env.B2_ACCOUNT_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
});

const bucketName = 'your-bucket-name';

b2.authorize().then(() => {
  console.log('Connected to Backblaze B2');
}).catch(err => {
  console.error('Failed to authorize with Backblaze B2', err);
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let filesData = [];

const uploadLimit = {};

app.post('/upload', upload.single('file'), async (req, res) => {
  const { description } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  const userInfo = {
    ip,
    userAgent: req.headers['user-agent'],
    referrer: req.headers['referer'] || req.headers['referrer'] || 'N/A',
    host: req.headers['host'],
    languages: req.headers['accept-language'],
    timestamp: new Date().toISOString(),
  };

  const currentTime = Date.now();

  if (!uploadLimit[ip]) {
    uploadLimit[ip] = [];
  }

  uploadLimit[ip] = uploadLimit[ip].filter(timestamp => currentTime - timestamp <= 600000);

  if (uploadLimit[ip].length >= 5) {
    return res.status(429).send('Rate limit exceeded. Try again later.');
  }

  if (!req.file) {
    return res.status(400).send('Upload failed or not allowed.');
  }

  uploadLimit[ip].push(currentTime);

  const fileExtension = path.extname(req.file.originalname);
  const randomName = crypto.randomBytes(8).toString('hex') + fileExtension;

  try {
    const uploadResponse = await b2.uploadFile({
      bucketId: bucketName,
      fileName: randomName,
      data: req.file.buffer,
      mime: req.file.mimetype,
    });

    const fileUrl = `https://f000.backblazeb2.com/file/${bucketName}/${uploadResponse.data.fileName}`;

    const fileData = {
      name: uploadResponse.data.fileName,
      originalName: req.file.originalname,
      url: fileUrl,
      description: description || 'No description provided',
      uploadedAt: userInfo.timestamp,
      userInfo,
    };

    filesData.push(fileData);

    res.send({ success: true, url: fileUrl });
  } catch (err) {
    console.error('Failed to upload file to Backblaze B2', err);
    res.status(500).send('File upload failed.');
  }
});

app.get('/files', (req, res) => {
  res.json(filesData);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
