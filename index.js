const readline = require('readline');
const fs = require('fs');
const { Server } = require('ssh2');
const color = code => str => `\x1b[${code}m${str}\x1b[0m`;
const accent = color("34"), dim = color("90");
const maxLen = 16;
const fmtName = name => `[${accent(name)}]`.padEnd(maxLen + 4);
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
		conn.stream.write(`\r\x1b[K${data}\r\n`);
		conn.io.prompt(true);
	}
}

// what to run for a user
function main(stream, username, client) {
	if(username === "guest") stream.write("(you're a guest user, btw)\n");
	let name = username;
	let formatted = fmtName(name);
	const io = readline.createInterface({
		input: stream,
		output: stream,
		prompt: "=> ",
		terminal: true,
		completer,
	});
	io.prompt();
	io.on("line", data => {
		data = data.trim();
		stream.write("\r\x1b[A");
		if(data[0] === "/") {
			const parts = data.slice(1).split(" ");
			if(data[1] === "/") {
				broadcast(`${formatted} ${data.slice(1)}`);
			} else if(parts[0] === "help") {
				return stream.write(help());
			} else if(parts[0] === "quit") {
				exit(stream);
				return;
			} else if(parts[0] === "nick") {
				const old = name;
				const nick = parts.slice(1).join(" ");
				name = nick ? nick : username;
				formatted = fmtName(name);
				broadcast(dim(`=> ${old} changed their name to ${nick}`));
			} else {
				stream.write(`unknown command ${parts[0]}\r\n`);
			}
			io.prompt();
			return;
		}
		broadcast(`${formatted} ${data}`);
	});

	io.on("SIGCONT", () => broadcast(dim(`=> ${username} is no longer afk`)));
	io.on("SIGSTP", () => broadcast(dim(`=> ${username} is afk`)));
	io.on("SIGINT", () => exit(stream));
	
	const user = { stream, io };
	client.on("close", () => {
		conns.delete(user);
		broadcast(dim(`=== ${username} left! ===`));
	});
	conns.add(user);
	broadcast(dim(`=== ${username} joined! ===`));
}

function exit(stream) {
	stream.write(`\r\n${accent("goodbye \u{1f44b}")}\r\n`);
	stream.exit(0);
	stream.end();
}

function help() {
	return [
		"/help - show this help",
		"/quit - exit",
		"/nick <name> - nickname",
		"// - start a message with a `/`",
	].join("\r\n") + "\r\n";
}

function completer(line) {
	const commands = ["/help", "/quit", "/nick"];
	if(!line) return [commands, line];
	const filtered = commands.filter(i => i.startsWith(line));
	return [filtered, line];
}

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: "=> ",
	completer,
});

const stream = process.stdout;
let name = color(32)("server");
rl.prompt();
rl.on("line", data => {
	data = data.trim();
	stream.write("\r\x1b[A");
	if(data[0] === "/") {
		const parts = data.slice(1).split(" ");
		if(data[1] === "/") {
			broadcast(`${formattedName} ${data.slice(1)}`);
		} else if(parts[0] === "help") {
			return stream.write(help());
		} else if(parts[0] === "quit") {
			rl.pause();
		} else if(parts[0] === "nick") {
			const nick = parts.slice(1).join(" ");
			name = color(32)(nick || "server");
			broadcast(dim(`=> server renamed to ${nick || "server"}`));
		} else {
			stream.write(`unknown command ${parts[0]}\r\n`);
		}
		rl.prompt();
		return;
	}
	broadcast(`[${name}] ${data}`);
});

rl.on("SIGINT", () => process.exit(0));
conns.add({ stream, io: rl });
server.listen(3000);
