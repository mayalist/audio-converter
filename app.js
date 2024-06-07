const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const multer = require('multer');


const app = express();
const port = 3000;

// Konfigurasi database MySQL
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'audio_converter'
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

// Set tampilan
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Rute utama
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/converter');
  } else {
    res.redirect('/login');
  }
});

// Rute login
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
    if (err) throw err;
    if (results.length > 0 && results[0].password === password) {
      req.session.user = results[0];
      res.redirect('/converter');
    } else {
      res.redirect('/login');
    }
  });
});




// Rute logout 
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).send('Error saat logout');
      }
      res.redirect('/login');
    });
  });
  
  

// Rute registrasi
app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], (err, result) => {
    if (err) throw err;
    res.redirect('/login');
  });
});


//konfigurasi storage multer
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
      cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Generate a unique filename
      }
    });
  
  const upload = multer({ storage: storage });

  //upload rute

  const uploadRoute = upload.single('file');
  app.post('/upload', uploadRoute, (req, res) => {
      if (!req.file) {
        return res.status(400).send('Tidak ada file yang diunggah');
      }
    
      const filePath = path.join(__dirname, 'uploads', req.file.filename);
    
      // Pindahkan file yang diunggah ke lokasi yang sesuai
  fs.rename(req.file.path, filePath, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Terjadi kesalahan saat memindahkan file');
    }

    res.send(`File berhasil diunggah: ${req.file.originalname}`);
  });
});



// Rute converter
app.get('/converter', (req, res) => {
  if (req.session.user) {
    db.query('SELECT * FROM conversions WHERE user_id = ?', [req.session.user.id], (err, results) => {
      if (err) throw err;
      res.render('converter', { 
        conversions: results,
        username: req.session.user.username // nama sapaan user untuk page converter
      });
    });
  } else {
    res.redirect('/login');
  }
});




//rute convert
app.post('/convert', upload.single('file'), (req, res) => {
    if (req.session.user) {
      const { format } = req.body;
      const inputFile = req.file;
  
      // Periksa jika file berhasil diunggah
      if (!inputFile) {
        return res.status(400).send('Tidak ada file yang diunggah');
      }
  
      // Tampilkan pesan file berhasil diunggah
      console.log('File berhasil diunggah:', inputFile.originalname);
  
      // Lanjutkan dengan proses konversi
      const outputFile = `${Date.now()}.${format}`;
      const outputPath = path.join(__dirname, 'public', 'converted', outputFile);
      const uploadPath = path.join(__dirname, 'uploads', inputFile.filename);
  
      ffmpeg(uploadPath)
        .toFormat(format)
        .output(outputPath)
        .on('end', () => {
          db.query('INSERT INTO conversions (user_id, input_file, output_file) VALUES (?, ?, ?)', [req.session.user.id, inputFile.filename, outputFile], (err, result) => {
            if (err) throw err;
  
            // Unduh file secara otomatis setelah konversi selesai
            res.download(outputPath, outputFile, (err) => {
              if (err) throw err;
            });
          });
        })
        .run();
    } else {
      res.redirect('/login');
    }
  });

// Rute download
app.get('/download/:file', (req, res) => {
    const file = req.params.file;
    if (!file) {
      return res.status(400).send('File tidak diberikan');
    }
  
    const filePath = path.join(__dirname, 'public', 'converted', file);
    console.log('Mencoba mengunduh file:', filePath); 
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        console.error('File tidak ditemukan:', filePath);
        return res.status(404).send('File tidak ditemukan');
      }
  
      res.download(filePath, file, (err) => {
        if (err) {
          console.error('Error downloading file:', err);
          throw err;
        }
      });
    });
  });  

// Buat direktori 'public/converted'
const convertedDir = path.join(__dirname, 'public', 'converted');
if (!fs.existsSync(convertedDir)) {
  fs.mkdirSync(convertedDir, { recursive: true });
}

// Menyajikan file statis dari folder 'public'
app.use(express.static('public'));


// Jalankan server
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});