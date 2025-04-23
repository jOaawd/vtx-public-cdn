const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const mime = require('mime-types');

const app = express();
const PORT = 3000;

const uploadRoot = path.join(__dirname, 'uploads');
const metaRoot = path.join(__dirname, 'metadata');
const logFile = path.join(__dirname, 'logs.txt');
const categories = ['images', 'videos', 'audio', 'other'];

// Ensure folders exist
// Ensure metadata root exists before checking individual meta files
if (!fs.existsSync(metaRoot)) fs.mkdirSync(metaRoot);

for (const category of categories) {
  const catPath = path.join(uploadRoot, category);
  if (!fs.existsSync(catPath)) fs.mkdirSync(catPath, { recursive: true });

  if (category !== 'other') {
    const thumbsPath = path.join(catPath, 'thumbnails');
    if (!fs.existsSync(thumbsPath)) fs.mkdirSync(thumbsPath, { recursive: true });
  }

  const metaFile = path.join(metaRoot, `${category}.json`);
  if (!fs.existsSync(metaFile)) fs.writeFileSync(metaFile, '[]');
}

// Helpers
const getCategory = (mimeType) => {
  if (mimeType.startsWith('image/')) return 'images';
  if (mimeType.startsWith('video/')) return 'videos';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'other';
};

const getClientIp = (req) => {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
};

const logAction = (ip, action) => {
  const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const entry = `[${timestamp}] from: ${ip} action: ${action}\n`;
  fs.appendFileSync(logFile, entry);
};

const updateMetadata = (category, fileData) => {
  const metaPath = path.join(metaRoot, `${category}.json`);
  const existing = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  existing.push(fileData);
  fs.writeFileSync(metaPath, JSON.stringify(existing, null, 2));
};

const blockedExts = ['.zip', '.exe', '.dll', '.bat', '.sh', '.js', '.php', '.py', '.html', '.htm'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const category = getCategory(file.mimetype);
    cb(null, path.join(uploadRoot, category));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomName = crypto.randomBytes(8).toString('hex') + ext;
    cb(null, randomName);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (blockedExts.includes(ext)) {
    return cb(new Error('This file type is not allowed for security reasons.'));
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/cdn', express.static('uploads'));

app.post('/upload', upload.single('file'), async (req, res) => {
  const { description } = req.body;
  const ip = getClientIp(req);
  if (!req.file) return res.status(400).send('Upload failed or file type not allowed.');

  const category = getCategory(req.file.mimetype);
  const filePath = path.join(uploadRoot, category, req.file.filename);
  const fileUrl = `${req.protocol}://${req.get('host')}/cdn/${category}/${req.file.filename}`;
  let thumbUrl = '';

  try {
    if (category === 'images') {
      const thumbName = 'thumb_' + req.file.filename;
      const thumbPath = path.join(uploadRoot, category, 'thumbnails', thumbName);
      await sharp(filePath).resize(200).toFile(thumbPath);
      thumbUrl = `${req.protocol}://${req.get('host')}/cdn/${category}/thumbnails/${thumbName}`;
    } else if (category === 'videos') {
      const thumbName = 'thumb_' + req.file.filename.replace(path.extname(req.file.filename), '.jpg');
      const thumbPath = path.join(uploadRoot, category, 'thumbnails', thumbName);
      await new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .screenshots({
            timestamps: ['00:00:01'],
            filename: thumbName,
            folder: path.join(uploadRoot, category, 'thumbnails'),
            size: '320x?'
          })
          .on('end', resolve)
          .on('error', reject);
      });
      thumbUrl = `${req.protocol}://${req.get('host')}/cdn/${category}/thumbnails/${thumbName}`;
    } else if (category === 'audio') {
      thumbUrl = '/default-icons/audio.png';
    } else {
      thumbUrl = '/default-icons/file.png';
    }
  } catch (err) {
    console.error('Thumbnail generation error:', err.message);
  }

  const fileData = {
    name: req.file.filename,
    url: fileUrl,
    thumb: thumbUrl,
    description: description || '',
    reports: 0,
    reportReasons: []
  };

  updateMetadata(category, fileData);
  logAction(ip, `uploaded ${fileData.name}`);
  res.send({ success: true, ...fileData });
});

app.get('/files', (req, res) => {
  const allFiles = [];

  for (const category of categories) {
    const metaPath = path.join(metaRoot, `${category}.json`);
    if (fs.existsSync(metaPath)) {
      const data = JSON.parse(fs.readFileSync(metaPath));
      for (const file of data) {
        allFiles.push({
          name: file.name,
          url: file.url,
          thumb: file.thumb,
          description: file.description
        });
      }
    }
  }

  res.json(allFiles);
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
