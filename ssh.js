const EventEmitter = require('events');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('ssh2');
const vars = require("./vars.json");
const users = new Map();
const server = {
	...vars.server,
	hostKeys: [fs.readFileSync("key")],
};

// load passwords
if(!fs.existsSync("users")) fs.writeFileSync("users", "");
const passwds = fs.createWriteStream("users", { flags: "a" });
for(let user of fs.readFileSync("users", "utf8").split("\n")) {
	const [name, pass] = user.split(" ");
	if(!name || !pass) continue;
	users.set(name, pass);
}

// hashing helper function
function hash(str) {
	return crypto.createHash("sha256").update(str).digest();
}

// new user
function newUser(ctx) {
	ctx.prompt([
		{ prompt: "think of a password: ", echo: false },
		{ prompt: "confirm the password: ", echo: false },
	], "new user!", "to claim this account, please add a password", (a) => {
		if(a[0] !== a[1]) return ctx.reject(["keyboard-interactive"]);
		users.set(ctx.username, hash(a[0]));
		passwds.write(`${ctx.username} ${a[0]}\n`);
		ctx.accept();
	});
}

// authenticate
function auth(ctx) {
	if(ctx.username.length > vars.maxlen) ctx.reject();
	if(ctx.username === "guest") return ctx.accept();
	if(!users.has(ctx.username)) {
		if(ctx.method === "keyboard-interactive") {
			return newUser(ctx);
		} else {
			return ctx.reject(["keyboard-interactive"]);
		}
	}
	if (ctx.method === "password" && hash(ctx.password) === users.get(ctx.username)) {
		ctx.accept();
	} else if(ctx.method === "publickey") {
		ctx.reject(["password"]);
	} else {
		ctx.reject();
	}
}

// automatically handle auth process
class AutoServer extends Server {
	constructor() {
		super(server);
		this.on("connection", this.handle.bind(this));
	}

	handle(client) {
		let username = "guest";
		client.on('authentication', (ctx) => {
			auth(ctx);
			username = ctx.username;
		});
		
		client.once('ready', () => {
			client.once('session', (accept) => {
				const session = accept();
				session.once('pty', (accept) => accept());
				session.once('shell', (accept) => {
					this.emit("user", accept(), client, username);
				});
			});
		});
	}
}

module.exports = AutoServer;
