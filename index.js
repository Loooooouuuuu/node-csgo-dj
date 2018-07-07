#!/usr/bin/env node
const vorpal = require('vorpal')();
var ffmpeg = require('fluent-ffmpeg');
var app = require('express')();
var fs = require('fs');
var youtubedl = require('youtube-dl');
var JsonDB = require('node-json-db');
var db = new JsonDB("sounds", true, false);
app.listen(3000);
var mkdirp = require('mkdirp');

var soundsFolders = {wav: './sounds/wav', source:'./sounds/source'};

for (var key in soundsFolders) {
    mkdirp(soundsFolders[key], function(err) {
        if(err) {
            throw new Error('Cannot create directory '+soundsFolders[key]+', please verify permissions in the folder');
        }
    });
}
var http = require('http').Server(app);

app.get('/', function(req, res){
    res.end('Hello !');
});


vorpal.command('yt <url...>', 'Converts a yt video to .wav and adds it to the library')
.option('-f, --from <timestamp>')
.option('-t, --to <timestamp>')
.option('-v, --volume <volume>').action(function(args, callback) {
    var name = "";
    if(args.hasOwnProperty('name')) {
        name = args.name;
    }
    var from, to;
    var volume = 100;
    if(args.options.from !== undefined) {
        from = args.options.from;
    }
    if(args.options.to !== undefined) {
        to = args.options.to;
    }
    if(args.options.volume !== undefined) {
        volume = args.options.volume;
    } else {
        try {
            volume = db.getData('/settings/volume');
        } catch(error) {
            db.push("/settings/volume", 100);
        }
    }
    downloadAndConvert(args.url.join(' '), name, callback, volume, from, to);
  });




  vorpal.command('play <id>', 'Sets the .wav.').action(function(args, callback) {
        data = db.getData('/sounds');
        var csgoPath = undefined;
        try {
            csgoPath = db.getData('/settings/path');
        } catch(error) {
            console.log('Please set the game`s path with the command "path". For example, "path /home/lou/.steam/steam/steamapps/common/Counter Strike Global Offensive');
        }
        if(csgoPath != undefined) {
            if(data[args.id] == undefined) {
                console.log("It seems like "+args.id+" doesn't exist");
            } else {
                // todo: check if path is correct !
                fs.unlink(csgoPath+"/voice_input.wav", function() {
                    var rs = undefined;
                    try {
                        rs = fs.createReadStream(data[args.id].uri);
                    } catch(error) {
                        console.log('Cannot read '+data[args.id].uri);
                    }
                    if(rs != undefined) {
                        try{
                            rs.pipe(fs.createWriteStream(csgoPath+"/voice_input.wav"));
                            var success = true;
                        } catch(error) {
                            console.log('Cannot write '+ csgoPath+"/voice_input.wav");
                        }
                        if(success) {
                            console.log('Playing ID '+args.id+": "+data[args.id].name);
                        }
                    }
                });
            }
        }
    callback();
  });

  vorpal.command('path <path...>', 'Sets the path of the source game').action(function(args, callback) {
    fs.stat(args.path.join(' '), function (err, stats){
        if (err) {
          console.log('Folder '+args.path.join(' ')+' doesn\'t exist');
        }
        else if (!stats.isDirectory()) {
            console.log('This is not a directory !');
        } else {
            db.push("/settings/path", args.path.join(' '), true);
            console.log('Path set to '+ args.path.join(' '));
        }
        callback();
    });
  });
  vorpal.command('list', 'List sounds in the soundboard').action(function(args, callback) {
    data = db.getData('/sounds');
    for(var i in data) {
        console.log("id: "+i+", name: "+data[i].name+", uri: "+data[i].uri);
    }
    callback();
  });

  vorpal.command('settings <setting> [value...]', 'Edit a setting or queries it').action(function(args, callback) {
    if(args.value !== undefined) {
        var value = args.value.join(' ');
        try {
            db.push("/settings/"+args.setting, value);
            console.log('Done !');
        } catch(error) {
            console.log("An error occured while setting "+args.setting+" to "+value+" :(");
        }
    } else {
        try {
            console.log(db.getData("/settings/"+args.setting));
        } catch(error) {
            console.log("An error occured while reading "+args.setting+" :(");
        }
    }
    callback();
  });

vorpal.delimiter('CSGODJ$').show();

function downloadAndConvert(url, name, callback, volume = 100, from, to) {
    var video = youtubedl(url, ['--extract-audio', '--format=best', '--audio-format=mp3']);
    video.on('info', function(info) {
        if(name === "") {
            name = info._filename.replace(/[^a-z0-9]/gi,'_');
        }
        console.log('Download started');
        var file = '/'+name;
        video.pipe(fs.createWriteStream(soundsFolders['source']+file));
        video.on('end', function() {
            console.log('finished downloading ! Converting '+soundsFolders['source']+file);
            var ffmpegCommand = ffmpeg(soundsFolders['source']+file).audioCodec('pcm_s16le').audioFrequency(22050).format('wav').outputOptions('-vn', '-map_metadata', '-1', '-ac', '1', '-flags', '+bitexact').output(soundsFolders['wav']+file+'.wav') .on('end', function() {
                console.log('Finished processing ! Adding '+soundsFolders['wav']+file+" to the soundboard") ;
                db.push("/sounds[]", { name: name, uri: soundsFolders['wav']+file+'.wav'}, true);
                callback();
            });
            if(from !== undefined) {
                ffmpegCommand.outputOptions('-ss '+from);
            }
            if(to !== undefined) {
                ffmpegCommand.outputOptions('-to '+to);
            }
            if(volume !== undefined) { 
                ffmpegCommand.audioFilters('volume='+volume/100);
            }
            ffmpegCommand.run();
        });
    });
}