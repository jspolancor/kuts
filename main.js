if (require('electron-squirrel-startup')) return;
const setupEvents = require("./installers/windows/setupEvents");
const { autoUpdater } = require('electron');
const appVersion = require("./package.json").version;
const os = require("os").platform();
let path = require("path");

// Electron stuff
let { app, BrowserWindow, shell } = require("electron");
let ipc = require("electron").ipcMain;
let dialog = require("electron").dialog;
let Store = require("electron-store");
let store = new Store();


const handleSquirrelEvent = () => {
  if (process.argv.length === 1) {
    return false;
  }

  const squirrelEvent = process.argv[1];
  const exeName = path.basename(process.execPath);

  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      spawnUpdate(['--createShortcut', exeName]);
      setTimeout(app.quit, 1000);
      return true;
    case '--squirrel-uninstall':
      spawnUpdate(['--removeShortcut', exeName]);
      setTimeout(app.quit, 1000);
      return true;

    case '--squirrel-obsolete':
      app.quit();
      return true;
  }
}

if (handleSquirrelEvent()) {
  // squirrel event handled and app will exit in 1000ms, so don't do anything else
  return;
}



// ffmpeg stuff
let ffprobeStatic = require("ffprobe-static");
let ffmpeg = require("fluent-ffmpeg");
let ffmpegStatic = require("ffmpeg-static");
ffmpeg.setFfmpegPath(ffmpegStatic.path.replace('app.asar', 'app.asar.unpacked'));
ffmpeg.setFfprobePath(ffprobeStatic.path.replace('app.asar', 'app.asar.unpacked'));

// node stuff
let fs = require("fs");
let rimraf = require("rimraf");
let exec = require("child_process").exec;

let appName = "Kuts";
let mainWindow;

let analysisProcess = null;
let trimmingProcess = null;
let volumeProcess = null;
let killBecauseOfCanceling = false;

let tempFolder = '';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 870,
    height: 600,
    backgroundColor: '#2D3047',
    show: false,
    minHeight: 700,
    minWidth: 870,
    resizable: true,
    fullscreen: false,
    icon: path.join(__dirname, "icons/png/64x64.png")
  });
  mainWindow.loadFile("index.html");
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.on('ready-to-show', function () {
    mainWindow.show();
    mainWindow.focus();
  });
}

// Shows an error message
ipc.on("quit-and-install", (event, title, content) => {
  autoUpdater.quitAndInstall();
});

// AUTO UPDATER

app.on("ready", () => {
  let updateFeed = "https://us-central1-olcms-db142.cloudfunctions.net/api/updates/latest";

  if (process.env.NODE_ENV !== "development") {
    updateFeed =
      os === "darwin"
        ? "https://us-central1-olcms-db142.cloudfunctions.net/api/updates/latest"
        : "https://s3.us-east-2.amazonaws.com/kuts/win/";
  }

  autoUpdater.setFeedURL(updateFeed + "?v=" + appVersion + "&os=" + os);

  createWindow();

  if (process.argv[1] && process.argv[1] == '--squirrel-firstrun') {
    setTimeout(()=> {
        autoUpdater.checkForUpdates();
    }, 30000)
  } else {
      autoUpdater.checkForUpdates();
  }

  // when the update has been downloaded and is ready to be installed
  // notify the BrowserWindow
  autoUpdater.on("update-downloaded", (event, info) => {
    setTimeout(() => {
      mainWindow.webContents.send("message", {
        message: "update downloaded",
        data: true
      });
    }, 9000);
  });

});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

// Shows an info message
ipc.on("open-info-dialog", (event, title, content) => {
  dialog.showMessageBox({
    type: "info",
    title: title,
    message: content
  });
});

// Shows an error message
ipc.on("open-error-dialog", (event, title, content) => {
  dialog.showErrorBox(title, content);
});

// Selects the video file to edit
ipc.on("open-file-dialog", event => {
  dialog.showOpenDialog(
    {
      properties: ["openFile"],
      filters: [
        {
          name: "Video",
          extensions: ["mkv", "avi", "mp4", "webm", "mov", "flv", "wmv"]
        }
      ]
    },
    files => {
      if (files) event.sender.send("selected-file", files);
    }
  );
});

// Selects the sound to add to the video
ipc.on("open-sound-dialog", event => {
  dialog.showOpenDialog(
    {
      properties: ["openFile"],
      filters: [{ name: "Sounds", extensions: ["mp3", "wav"] }]
    },
    files => {
      if (files) event.sender.send("selected-sound", files);
    }
  );
});

ipc.on("open-file", (event, file) => {
  shell.openItem(path.dirname(file) + "/");
});

ipc.on("open-link", (event, url) => {
  shell.openExternal(url);
});

ipc.on("cancel-process", event => {
  killBecauseOfCanceling = true;
  if (volumeProcess != null) {
    volumeProcess.kill();
    volumeProcess = null;
  }
  if (analysisProcess != null) {
    analysisProcess.kill();
    analysisProcess = null;
  }
  if (trimmingProcess != null) {
    trimmingProcess.kill();
    trimmingProcess = null;
  }
  rimraf(tempFolder, () => { });
  tempFolder = '';
});

const videoProcessor = {
  volumeProcess: null,
  analysisProcess: null,
  trimmingProcess: null
};

// Processes the video
ipc.on("process-video", function (
  event,
  file,
  sound,
  jumpcuts = true,
  silenceTime = 1,
  silenceVolume = 11,
  breathingTime = 0.2
) {
  killBecauseOfCanceling = false;
  // Get user info
  let user = store.get("u");
  // Validate if the user is paying
  if (!user.plan) {
    silenceTime = 1;
    silenceVolume = 11;
    breathingTime = 0.2;
  }

  // Create the file names for audio and video
  let fileExtension = file.substr(file.lastIndexOf(".") + 1);
  let filename = file.replace(/^.*[\\\/]/, "");
  let fileNameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  let folderPath = path.dirname(file) + "/";
  let finalFilePath = `${folderPath}${fileNameWithoutExt}_${appName}_edit.${fileExtension}`;

  // Create the temporal folder
  tempFolder = folderPath + ".kuts" + Math.floor(new Date() / 1000);
  if (!fs.existsSync(tempFolder)) {
    fs.mkdirSync(tempFolder);
  }

  let editedFileName = `${tempFolder}/${fileNameWithoutExt}_${appName}_edit.${fileExtension}`;
  let editedSoundFileName = `${tempFolder}/${fileNameWithoutExt}_${appName}_edit.mp3`;

  // Initialize variables

  let silences = [];
  let noises = [];
  let inputDuration = 0;
  let minVolume = -26;
  let maxVolume = -0;

  // analyzeAudioData();
  getVolumeLevels();

  function getVolumeLevels() {
    volumeProcess = ffmpeg(file)
      .audioFilter("volumedetect")
      .addOption("-f", "null")
      .on("error", function (err) {
        if (!killBecauseOfCanceling) {
          event.sender.send("message", {
            message: "levels errored",
            data: err.message
          });
        }
      })
      .on("progress", progress => {
        event.sender.send("message", {
          message: "levels progress",
          data: progress
        });
      })
      .on("start", function (commandLine) {
        event.sender.send("message", {
          message: "levels started",
          data: commandLine
        });
      })
      .on("end", function (stdout, stderr) {
        event.sender.send("message", { message: "levels ended", data: true });
        minVolume = parseInt(
          stderr
            .split("mean_volume:")[1]
            .split("dB")[0]
            .trim()
        );
        maxVolume = parseInt(
          stderr
            .split("max_volume:")[1]
            .split("dB")[0]
            .trim()
        );
        event.sender.send("message", {
          message: "volume levels ended",
          data: { min: minVolume, max: maxVolume, command: stderr }
        });
        volumeProcess.kill();
        analyzeAudioData();
      });
    volumeProcess.save(tempFolder + "/l.txt");
  }

  /**
   * Creates the array of noises and silences
   */
  function analyzeAudioData() {
    // Calculate decibels
    let range = maxVolume - minVolume;
    let decibels = (parseInt(silenceVolume) / 100) * range + minVolume;

    analysisProcess = ffmpeg(file)
      .audioFilters(`silencedetect=n=${decibels}dB:d=${silenceTime}`)
      .on("codecData", function (data) {
        const splittedTime = data.duration.split(":");
        const hours = parseInt(splittedTime[0]) * 3600;
        const minutes = parseInt(splittedTime[1]) * 60;
        const seconds = parseFloat(splittedTime[2]);
        inputDuration = hours + minutes + seconds;
        event.sender.send("message", {
          message: "analysis duration",
          data: inputDuration
        });
      })
      .on("start", function (commandLine) {
        event.sender.send("message", {
          message: "analysis started",
          data: commandLine
        });
      })
      .on("progress", function (progress) {
        event.sender.send("message", {
          message: "analysis progress",
          data: progress
        });
      })
      .on("stderr", function (stderrLine) {
        event.sender.send("message", {
          message: "analysis line",
          data: stderrLine
        });
        if (stderrLine.indexOf("silence_end:") >= 0) {
          const silenceEnd = parseFloat(
            stderrLine
              .split("silence_end:")[1]
              .split("|")[0]
              .trim()
          );
          const silenceDuration = parseFloat(
            stderrLine.split("silence_duration:")[1].trim()
          );
          const silenceStart = silenceEnd - silenceDuration;
          const isInArray = silences.find(prevSilence => {
            return (
              prevSilence.start == silenceStart &&
              prevSilence.end == silenceEnd &&
              prevSilence.duration == silenceDuration
            );
          });
          if (!isInArray) {
            silences.push({
              start: silenceStart,
              end: silenceEnd,
              duration: silenceDuration
            });
          }
        }
      })
      .on("error", function (err) {
        if (!killBecauseOfCanceling) {
          event.sender.send("message", {
            message: "analysis errored",
            data: err
          });
        }
      })
      .on("end", function (err) {
        // Using the silences array create the noises array
        silences.forEach((silence, index) => {
          if (index == 0) {
            noises.push({
              start: 0,
              end: silence.start,
              duration: silence.start
            });
          }
          if (index > 0) {
            noises.push({
              start: silences[index - 1].end,
              end: silence.start,
              duration: silence.start - silences[index - 1].end
            });
          }
        });
        if (silences[silences.length - 1]) {
          noises.push({
            start: silences[silences.length - 1].end,
            end: inputDuration,
            duration: inputDuration
          });
        }
        if (!err) {
          event.sender.send("message", {
            message: "analysis ended",
            data: { noises: noises }
          });
          trimVideo();
        }
      });
    analysisProcess.save(editedSoundFileName);
  }

  /**
   * Trims the video
   */
  function trimVideo() {
    let videoFilters = "";
    let audioFilters = "";

    let ffmpegInstance = ffmpeg(file);

    if (!user.plan) {
      ffmpegInstance = ffmpegInstance.input("img/small-watermark.png");
    }

    noises.forEach((noise, index) => {
      let addedPlusToEnd = index != noises.length - 1 ? "+" : "";
      const noiseStartOneDecimal = Math.round(noise.start * 10) / 10;
      const noiseEndOneDecimal = Math.round(noise.end * 10) / 10;
      videoFilters += `between(t\,${noiseStartOneDecimal -
        breathingTime},${noiseEndOneDecimal + breathingTime})${addedPlusToEnd}`;
      audioFilters += `between(t\,${noiseStartOneDecimal -
        breathingTime},${noiseEndOneDecimal + breathingTime})${addedPlusToEnd}`;
    });

    // Add watermark
    let audioFilter = `[0:a]aselect='${audioFilters}',asetpts=N/SR/TB;`;
    let videoFilter = `[0:v]select='${videoFilters}',setpts=N/FRAME_RATE/TB`;

    let watermark = "";
    let quality480 = "";

    if (!user.plan) {
      videoFilter += "[tv];";
      watermark = "[tv][1:v]overlay=10:10";
    }

    ffmpegInstance = ffmpegInstance
      .complexFilter([`${audioFilter}${videoFilter}${watermark}${quality480}`])
      .output(editedFileName)
      .on("start", commandLine => {
        event.sender.send("message", {
          message: "trim started",
          data: commandLine
        });
      })
      .on("progress", progress => {
        event.sender.send("message", {
          message: "trim progress",
          data: progress
        });
      })
      .on("error", err => {
        if (!killBecauseOfCanceling) {
          event.sender.send("message", { message: "trim errored", data: err });
        }
      })
      .on("end", err => {
        if (!err) event.sender.send("message", { message: "trim ended" });
        finish();
      });
    trimmingProcess = ffmpegInstance;
    trimmingProcess.run();
  }

  function allFinished() {
    // Remove temporary folder
    rimraf(tempFolder, () => {
      event.sender.send("message", { message: "folder deleted" });
    });    
    tempFolder = '';
    event.sender.send("message", { message: "all ended", data: finalFilePath });
  }

  function finish() {
    copyFile(editedFileName, finalFilePath, allFinished);
  }

  function copyFile(source, target, cb) {
    let cbCalled = false;
    let rd = fs.createReadStream(source);
    rd.on("error", err => {
      done(err);
    });
    let wr = fs.createWriteStream(target);
    wr.on("error", err => {
      done(err);
    });
    wr.on("close", ex => {
      done();
    });
    rd.pipe(wr);

    function done(err) {
      if (!cbCalled) {
        cb(err);
        cbCalled = true;
      }
    }
  }
});
