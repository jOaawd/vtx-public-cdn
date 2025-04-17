const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

const uploadPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const randomName = crypto.randomBytes(8).toString('hex');
    cb(null, `${randomName}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.html' || ext === '.htm') return cb(null, false);
  cb(null, true);
};

const upload = multer({ storage, fileFilter });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/cdn', express.static('uploads'));

let filesData = [];

const uploadLimit = {};

app.post('/upload', upload.single('file'), (req, res) => {
  const { description } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  const userInfo = {
    ip,
    userAgent: req.headers['user-agent'],
    referrer: req.headers['referer'] || req.headers['referrer'] || 'N/A',
    host: req.headers['host'],
    languages: req.headers['accept-language'],
    timestamp: new Date().toISOString()
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

  const fileUrl = `${req.protocol}://${req.get('host')}/cdn/${req.file.filename}`;
  const fileData = {
    name: req.file.filename,
    originalName: req.file.originalname,
    url: fileUrl,
    description: description || 'No description provided',
    uploadedAt: userInfo.timestamp,
    userInfo
  };

  filesData.push(fileData);

  res.send({ success: true, url: fileUrl });
});

app.get('/files', (req, res) => {
  res.json(filesData);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
