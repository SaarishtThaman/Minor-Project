const express = require('express');
const router = express.Router();
const fs = require('fs');
const HTMLToPDF = require('html5-to-pdf');
const multer = require('multer');
const User = require('../models/User');
const Checkup = require('../models/Checkup');
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, './uploads/');
    },
    filename: function(req, file, cb) {
        //const now = new Date().toISOString(); const date = now.replace(/:/g, '-'); cb(null, date + file.originalname);
        cb(null, 10000000+Math.ceil(Math.random()*10000000)+".jpg");
    }
});
const upload = multer({storage: storage});
const { ensureAuthenticated, forwardAuthenticated } = require('../config/auth');

// Specific variables (tentative storage)
let patientname = '';
let age = '';
let filename = '';
let gender = '';
let grade = '';
let fl = '';
let examination = '';
let view = '';
let d = '';

// Welcome Page
router.get('/', forwardAuthenticated, (req, res) => res.render('welcome'));

// Dashboard
router.get('/dashboard', ensureAuthenticated, (req, res) =>
  res.render('dashboard', {user: req.user})
);

// Dashboard post request
router.post('/dashboard', ensureAuthenticated, upload.single('xray'), function(req,res) {
  // Spawns preprocessing scripts and executes it
  // var spawn = require('child_process').spawn;
  // var process = spawn('python', ['./Preprocessing/Main.py',req.file.filename]);
  // process.stdout.on('data', (data) => {
  //   console.log(data.toString());
  // });
  console.log(req.body);
  let errors = [];

  patientname = req.body.patientname;
  age = req.body.age;
  gender = req.body.gender;
  examination = req.body.examination;
  view = req.body.view;
  if(!patientname || !age) {
    errors.push({ msg: 'Please enter all the fields' });
  }
  if(parseInt(age,10)<0) {
    errors.push({ msg: 'Age cannot be negative' });
  }
  if(!req.file) {
    errors.push({ msg: 'Please upload the x-ray file' });
  }
  if(errors.length > 0) {
    res.render('dashboard',{errors, user: req.user});
  }
  else {
    fl = req.file.filename;
    filename = fl.slice(0,-4);
    res.render('preprocess', {patientname: patientname, imgname: fl, examination: examination, view: view});
  }
  // process.on('close',(code) => {
  //   res.render('preprocess', {patientname: patientname, imgname: filename+".jpg", pimgname: prfile, age: age});
  // });
});

// Get Report
router.post('/getreport', ensureAuthenticated, function(req,res) {
  // Spawns preprocessing scripts and executes it
  var spawn = require('child_process').spawn;
  var process = spawn('python', ['./Preprocessing/Main.py', fl]);
  process.stdout.on('data', (data) => {
    var out = data.toString();
    console.log("output is "+out);
    grade = out.charAt(9);// Gets grade from dl model
    console.log(grade);
  });
  process.on('close',(code) => {
    fs.copyFile("reports/"+grade+".html", "reports/"+filename+".html", (err) => {
      if (err) throw err;
      else {
        console.log('copy successful');
        fs.readFile("reports/"+filename+".html", 'utf8', function (err,data) {
          if (err) {
            return console.log(err);
          }

          // Replaces data in sample report with actual data
          d = new Date();
          let datetime = ""+d.getDate()+"/"+d.getMonth()+"/"+d.getFullYear()+" "+d.getHours()+":"+d.getMinutes()+":"+d.getSeconds();

          var r1 = data.replace(/sample_name/g, ''+patientname).replace(/sample_age/g, ''+age)
          .replace(/sample_serial/g, ''+filename).replace(/sample_gender/g, ''+gender)
          .replace(/sample_path/g, ''+fl).replace(/sample_datetime/g, ''+datetime)
          .replace(/sample_examination/g, ''+examination).replace(/sample_view/g, ''+view);

          fs.writeFile("reports/"+filename+".html", r1, 'utf8', function (err) {
             if (err) return console.log(err);
             else {
               // Generates pdf after html file is written
               const run = async () => {
                  const html5ToPDF = new HTMLToPDF({
                    inputPath: "./reports/"+filename+".html",
                    outputPath: "./reports/"+filename+".pdf",
                    templatePath: "./uploads",
                    renderDelay: 1000,
                    pdf: {printBackground: true, scale: 1.4}
                  });
                    await html5ToPDF.start();
                    await html5ToPDF.build();
                    await html5ToPDF.close();
                  }

                  (async () => {
                    try {
                      await run()
                      console.log("DONE")
                    } catch (error) {
                      console.error(error);
                    } finally {
                      console.log("EXITED");
                      res.render('getreport',{user: req.user, flnm: filename, patientname: patientname});
                    }
                  })()
             }
          });
        });
      }
    });
  });
});

// Finish button to save current checkup
router.get('/finish', ensureAuthenticated, function(req, res) {
  // User.findOne({ email: req.user.email }, function(err,data) {
  //   if(err) throw err;
  //   else {
  //     console.log(data);
  //     var topush = {patientname: patientname, age: age, grade: grade, gender: gender, filename: filename, examination: examination, view: view};
  //     data.checkups.push(topush);
  //     data.save();
  //     req.flash('success_msg', 'Checkup saved');
  //     res.redirect('dashboard');
  //   }
  // });
  Checkup.insertMany([
    {email: req.user.email, patientname: patientname, age: age, grade: grade, gender: gender, filename: filename, examination: examination, view: view, date: d},])
    .then(function(){
      console.log("Data inserted"); // Success
      req.flash('success_msg', 'Checkup saved');
      res.redirect('dashboard');
    }).catch(function(error){
      console.log(error);  // Failure
      req.flash('error_msg', 'Could not save to database, check log for details');
      res.redirect('dashboard');
    });
  });

// Spits out all checkups to date in a tabular form
router.get('/viewreports', ensureAuthenticated, function(req, res) {
  Checkup.find({ email: req.user.email }, function(err,data) {
    if(err) throw err;
    else {
      if(!data || data.length == 0) res.render('viewreports', {user: req.user, data: "nothing"});
      else res.render('viewreports', {user: req.user, data: data});
    }
  });
});

// Processes search query
router.post('/viewreports', ensureAuthenticated, function(req, res) {
  console.log(req.body);
  let query = req.body.searchquery;
  let searchtype = req.body.searchtype;

  let errors = [];

  if(query == '') {
    errors.push({ msg: 'Please enter a query' });
    Checkup.find({ email: req.user.email }, function(err,data) {
      if(err) throw err;
      else {
        if(!data || data.length == 0) res.render('viewreports', {errors, user: req.user, data: "nothing"});
        else res.render('searchreports', {errors, user: req.user, data: data});
      }
    });
  }

  // If statements for different search types
  else {
    if(searchtype == 'pn') {
      Checkup.find({ email: req.user.email, patientname: {'$regex': query, '$options' : 'i'} }, function(err,data) {
        if(err) throw err;
        else {
          if(!data || data.length == 0) res.render('viewreports', {user: req.user, data: "nothing"});
          else res.render('searchreports', {user: req.user, data: data});
        }
      });
    }
    if(searchtype == 'sr') {
      Checkup.find({ email: req.user.email, filename: query }, function(err,data) {
        if(err) throw err;
        else {
          if(!data || data.length == 0) res.render('viewreports', {user: req.user, data: "nothing"});
          else res.render('searchreports', {user: req.user, data: data});
        }
      });
    }
    if(searchtype == 'gn') {
      Checkup.find({ email: req.user.email, gender: {'$regex': query, '$options' : 'i'} }, function(err,data) {
        if(err) throw err;
        else {
          if(!data || data.length == 0) res.render('viewreports', {user: req.user, data: "nothing"});
          else res.render('searchreports', {user: req.user, data: data});
        }
      });
    }
    if(searchtype == 'gr') {
      Checkup.find({ email: req.user.email, grade: query }, function(err,data) {
        if(err) throw err;
        else {
          if(!data || data.length == 0) res.render('viewreports', {user: req.user, data: "nothing"});
          else res.render('searchreports', {user: req.user, data: data});
        }
      });
    }
    if(searchtype == 'ag') {
      Checkup.find({ email: req.user.email, age: query }, function(err,data) {
        if(err) throw err;
        else {
          if(!data || data.length == 0) res.render('viewreports', {user: req.user, data: "nothing"});
          else res.render('searchreports', {user: req.user, data: data});
        }
      });
    }
  }
});

module.exports = router;
