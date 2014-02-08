// bot.js
// A simple irc bot
var me = {
    nick: "nickname",
    realname: "alpha node.js bot"
}
var config = {
    channels: ["#bottest"],
    server: "servername.com",
    port: 8443,
    botName: me.nick
};
var sqlite3 = require("sqlite3");
var karmaData = {};
var memos = {};
var fs = require("fs");
fs.exists("irc.db", function(exists) {
    db = new sqlite3.Database("irc.db");
    if (!exists) {
        // this section should create a new irc db
        console.info("No database. Bot knowledge will be nil.");
   } else {
       var karma = db.prepare("select nick,val from karma");
       karma.each(function(err, row) {
           karmaData[row.nick] = row.val;
       });
       var m = db.prepare("select name, description from memo");
       m.each(function(err, row) {
           memos[row.name] = row.description;
       });

   } 
});

var irc = require("irc");
var bot = new irc.Client(config.server, config.botName, {
    realName: me.realname,
    port: config.port,
    channels: config.channels,
    autoRejoin: true,
    autoConnect: true,
    messageSplit: 512
});

bot.addListener("message", function (nick, to, text) {
    var w = text.split(' ');
    karma_changes(nick, w, to);
    var cmdpattern = new RegExp("^" + me.nick + ":\\s*(.*?)$");
    var cmdtext = cmdpattern.exec(text);
    if (cmdtext) {
        botmemo(nick, to, cmdtext[1]);
    }
    if (text.match(/http/)) {
        get_url_title(text, to);
    }
    if (text.charAt(0) == "'") {
        var cmd_str = text.substr(1);
        var cmd = cmd_str.split(' ');
        switch (cmd[0]) {
            case 'karma':
                if (typeof karmaData[cmd[1]] === 'undefined') {
                    karmaData[cmd[1]] = 0;
                }
                bot.say(to, 'Karma for ' + cmd[1] + ' is ' + karmaData[cmd[1]]);
                break;
            case 'excuse':
                get_excuse(to);
                break;
            case 'summon':
                cmd.shift();
                var thing = cmd.join(' ');
                var summon = thing + ' ' + thing + ' '  + thing + ' '  + thing + ' come to me!';
                bot.say(to, summon.toUpperCase());
                break;
            case 'topic':
                cmd.shift();
                bot.send('TOPIC', to, cmd.join(' '));
                break;
            case 'quote':
                cmd.shift();
                var ts = new Date();
                db.run("insert into quotes values(?,?,?,?)", null, ts.toDateString(), nick, cmd.join(' '));
                bot.say(to, "Quote added, " + nick);
                break;
            case 'help':
                bot.say(to, "Available commands: 'karma nick, 'excuse, 'summon <thing>, '<memo> 'quote <quote>");
                bot.say(to, "You can store a memo by typing bot:XXX is YYY. Type bot:forget XXX to get rid of a memo.");
                break;
            default:
                // check cmd_str against memos
                if (memos[cmd_str]) {
                    bot.say(to, cmd_str + ' is ' + memos[cmd_str]);
                } else {
                    bot.say(to, "I dunno, " + nick);
                }
                break;
        }
    }
});

function get_url_title(url, to) {
    var request = require("request");
    var cheerio = require("cheerio");
    var util = require('util');
//    request.get( url, { 'proxy':'http://proxy.xx.com:8080' }, function(err, response, body) {
    request.get( url, function(err, response, body) {
        if (err) {
            console.log('error');
        } else {
            var $ = cheerio.load(body);
            var title = $('title').text();
            var trimmed = title.replace(/^\s+|\s+$/g, '');
            if (! title.match(/Deutsche Bank Security/)) {
                bot.say(to, '"' + trimmed + '"');
            }

        }
   });
}

function get_excuse(to) {
    var fs = require("fs");
    fs.exists("./excuses", function(exists) {
        if (exists) {
            var data = fs.readFileSync("./excuses"); 
            var excuses = data.toString().split('\n');
            var rand=Math.floor(Math.random()*excuses.length);
            bot.say(to, 'Your excuse is: ' + excuses[rand]);
        } else {
            bot.say(to, "No excuses today");
        }
    });
}

function karma_changes(nick, w, to) {
    for (var i in w) {
       if (w[i].match(/\+\+$/)) {
           var name = w[i].slice(0,-2);
           if (nick == name) { 
               bot.say(to, "You can't increment your own karma, egotist.");
               continue;
           }
           if (name in karmaData) { 
               karmaData[name]++; 
               db.run("update karma set val=? where nick=?", karmaData[name], name);
           } else if (name) {
               karmaData[name] = 1; 
               db.run("insert into karma values(?,?)", name, karmaData[name]);
           }
       } else if(w[i].match(/--$/)) {
           var name = w[i].slice(0,-2);
           if (name in karmaData) { 
               karmaData[name]--; 
               db.run("update karma set val=? where nick=?", karmaData[name], name);
           } else if (name) { 
               karmaData[name] = -1; 
               db.run("insert into karma values(?,?)", name, karmaData[name]);
           }
       }
    }
}

function botmemo(nick, to, memotext) {
    // Supported actions: 
    // memo is something
    // memo is also something
    // forget memo
    var forget = memotext.match(/^forget\s+(.*)$/);
    if (forget) {
        var key = forget[1];
        db.run("delete from memo where name=?", key);
        delete memos[key];
        bot.say(to, "I forgot about " + key);
        return;
    };
    var regex = /^(.*?)\s+is\s+(.*)$/;
    if (regex.test(memotext)) {
        var match = regex.exec(memotext);
        var memo  = match[1];
        var value = match[2];
        // Check whether this already exists in db.
        if (memos[memo]) {
            // bot.say(to, "But " + nick + ", " + memo + " is " + memos[memo]);
            memos[memo] = memos[memo] + " and " + value;
            db.run("update memo set description=? where name=?", memos[memo], memo);
            bot.say(to, memo + " is now " + memos[memo]);
        } else {
            bot.say(to, "OK -- storing " + memo);
            memos[memo] = value;
            db.run("insert into memo values(?,?)", memo, value);
        }
    } else {
        bot.say(to, "Beats me, " + nick);
    }
}