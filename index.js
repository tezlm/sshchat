const EventEmitter = require('events');
const readline = require('readline');
const fs = require('fs');
const { Server } = require('ssh2');
const color = code => str => `\x1b[${code}m${str}\x1b[0m`;
const accent = color("34"), dim = color("90");
const maxLen = 16;
const conns = new Set();
const users = new Map();

// load passwords
if(!fs.existsSync("users")) fs.writeFileSync("users", "");
const passwds = fs.createWriteStream("users", { flags: "a" });
for(let user of fs.readFileSync("users", "utf8").split("\n")) {
	const [name, pass] = user.split(" ");
	if(!name || !pass) continue;
	users.set(name, pass);
}

const server = new Server({
	hostKeys: [fs.readFileSync("key")],
	banner: "welcome \u{1f303}",
	ident: "srv-J1149",
}, client => {
	let username = "guest";
	// auth user
	client.on('authentication', (ctx) => {
		username = ctx.username;
		if(ctx.username.length > maxLen) return ctx.reject();
		if(ctx.username === "guest") return ctx.accept();
		if(!users.has(ctx.username)) {
			if(ctx.method === "keyboard-interactive") {
				return newUser(ctx);
			} else {
				return ctx.reject(["keyboard-interactive"]);
			}
		}
		if (ctx.method === "password" && ctx.password === users.get(ctx.username)) {
			ctx.accept();
		} else if(ctx.method === "publickey") {
			ctx.reject(["password"]);
		} else {
			ctx.reject();
		}
	});
	
	client.on('ready', () => {
		client.on('session', (accept) => {
			const session = accept();
			session.once('pty', (accept) => accept());
			session.once('shell', (accept) => {
				main(accept(), username, client);
			});
		});
	});
});

// bad joke
function cmd(stream) {
	stream.write("Microsoft Windows [Version 10.0.19042.631]\n");
	stream.write("(c) 2020 Microsoft Corporation. All rights reserved.\n");
	stream.write("\n");
	stream.write("C:\\Users\\zestylemonade> ");
	stream.on("data", (d) => {
		d = d.toString().trim();
		if(!d) {
			stream.write("C:\\Users\\zestylemonade> ");
			return;
		}
		stream.write("'" + d.match(/[^\s]+/) + "' is not recognized as an internal or external command,\n");
		stream.write("operable program, or batch file.\n\n");
		stream.write("C:\\Users\\zestylemonade> ");
	});
}

// new user
function newUser(ctx) {
	ctx.prompt([
		{ prompt: "think of a password: ", echo: false },
		{ prompt: "confirm the password: ", echo: false },
	], "new user!", "to claim this account, please add a password", (a) => {
		if(a[0] !== a[1]) return ctx.reject(["keyboard-interactive"]);
		users.set(ctx.username, a[0]);
		passwds.write(`${ctx.username} ${a[0]}\n`);
		ctx.accept();
	});
}

// send to all connections
function broadcast(data) {
	for(let conn of conns) {
		conn.write(data);
	}
}

// client class
class Client extends EventEmitter {
	constructor(stream, username, admin = false, server = false) {
		super();
		this.username = username;
		this.name = username;
		this.admin = admin;
		this.stream = server ? stream.stdout : stream;
		this.io = readline.createInterface({
			input: server ? stream.stdin : stream,
			output: server ? stream.stdout : stream,
			prompt: "=> ",
			terminal: true,
			completer,
		});
	}

	init() {
		this.io.prompt();
		this.io.on("line", data => {
			this.stream.write("\x1b[A\x1b[K");
			this.handle(data.trim());
			this.io.prompt();
		});
	
		this.io.on("SIGCONT", () => this.emit("meta", `=> ${this.name} is no longer afk`));
		this.io.on("SIGSTP", () => this.emit("meta", `=> ${this.name} is afk`));
		this.io.on("SIGINT", () => this.emit("exit"));
		
		this.emit("meta", `=== ${this.name} joined! ===`);
	}

	handle(data) {
		if(data[0] === "/") {
			const parts = data.slice(1).split(" ");
			if(data[1] === "/") {
				this.emit("message", `${this.formatted} ${data.slice(1)}`);
			} else if(parts[0] === "help") {
				this.stream.write(help(this.admin));
			} else if(parts[0] === "shrug") {
				this.emit("message", `${this.formatted} ${parts.slice(1).join(" ")} ¯\\_(ツ)_/¯`);
			} else if(parts[0] === "quit") {
				this.emit("exit");
			} else if(parts[0] === "nick") {
				const old = this.name;
				const nick = parts.slice(1).join(" ");
				if(nick.length > maxLen) {
					return stream.write("name too long\x1b[K\r\n");
				}
				this.name = nick ? nick : this.username;
				this.emit("meta", `=> ${old} changed their name to ${nick}`);
			} else {
				this.stream.write(`unknown command ${parts[0]}\r\n`);
			}
		} else if(data) {
			this.emit("message", `${this.formatted} ${data}`);
		}
	}

	write(data) {
		this.stream.write(`\r\x1b[K${data}\r\n`);
		this.io.prompt(true);
	}

	get formatted() {
		return `[${color(this.admin ? 32 : 34)(this.name)}]`.padEnd(maxLen + 4);
	}
}

// what to run for a user
function main(stream, username, client) {
	if(username === "guest") stream.write("(you're a guest user, btw)\n");
	const user = new Client(stream, username);
	user.on("message", d => broadcast(d));
	user.on("meta", d => broadcast(dim(d)));
	user.on("exit", exit);
	client.on("close", exit);
	conns.add(user);
	user.init();
	
	function exit() {
		stream.write(`\r\n${dim("goodbye \u{1f44b}")}\r\n`);
		stream.exit(0);
		stream.end();
		conns.delete(user);
		broadcast(dim(`=== ${username} left! ===`));	
	}
}

function help(admin) {
	const commands =  [
		"// - start a message with a `/`",
		"/help - show this help",
		"/quit - exit",
		"/nick <name> - nickname",
		"/shrug <msg> - add a shrug",
	];
	if(admin) commands.push("/kick <username> - kick a user");
	return commands.join("\r\n") + "\r\n";
}

function completer(line) {
	const commands = "help quit nick shrug".split(" ").map(i => `/${i} `);
	if(!line) return [commands, line];
	const filtered = commands.filter(i => i.startsWith(line));
	return [filtered, line];
}

const admin = new Client(process, "server", true, true);
admin.on("message", d => broadcast(d));
admin.on("meta", d => broadcast(dim(d)));
admin.on("exit", () => process.exit(0));
admin.init();
conns.add(admin);

process.on("exit", () => {
	broadcast(dim("=== the server is going down NOW!!! ==="));
	broadcast(dim("===         have a good day         ==="));
	for(let i of conns) i.stream.write("\r\x1b[k\n");
});

admin.write(dim("=== welcome ==="));
server.listen(3000);
