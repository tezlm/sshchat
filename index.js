const Server = require('./ssh.js');
const Client = require('./client.js');
const vars = require("./vars.json");
const color = (str, code) => `\x1b[${code}m${str}\x1b[0m`;
const dim = str => color(str, vars.color.system);
const valid = /^[a-z0-9_]+$/;
const conns = new Set();
const server = new Server();

function getUser(nick) {
	for(let i of conns) {
		if(nick === i.name) return i;
	}
}

// client commands
Client.command("help", (user) => {
	user.write(help(user.admin));	
});

Client.command("quit", (user) => {
	user.emit("exit");
});

Client.command("shrug", (user, args) => {
	user.emit("message", `${user.formatted} ${args.join(" ")} ¯\\_(ツ)_/¯`);
});

Client.command("nick", (user, args) => {
	const old = user.name;
	const nick = args[0];
	if(nick.length === 0) {
		return user.write("name too short\x1b[K");
	}
	if(nick.length > vars.maxlen) {
		return user.write("name too long\x1b[K");
	}
	if(!valid.test(nick)) {
		return user.write("bad name\x1b[K");
	}
	if(getUser(nick)) {
		return user.write("name already taken\x1b[K");
	}
	user.name = nick ? nick : user.username;
	user.emit("meta", `=> ${old} changed their name to ${user.name}`);			
});

Client.command("kick", (user, args) => {
	if(!user.admin) return user.write("no perms lol");
	const toKick = getUser(args[0])
	if(!toKick) {
		return user.write("could not find user");
	}
	user.emit("meta", `=> kicked ${toKick.name}`);	
	toKick.write(dim("you have been kicked"));
	toKick.stream.close();
});

// send to all connections
function broadcast(data) {
	for(let conn of conns) conn.write(data);
}

// handle a new user
server.on("user", (stream, client, username) => {
	if(username === "guest") stream.write("(you're a guest user, btw)\r\n");

	const user = new Client(stream, username);
	user.on("message", d => broadcast(d));
	user.on("meta", d => broadcast(dim(d)));
	user.on("exit", () => exit(user));
	client.on("close", () => exit(user));

	for(let i of conns) {
		if(username === i.name && i.name !== i.username) {
			i.name = i.username;
			broadcast(dim(`=> reset ${i.name}'s nick because`));
			break;
		}
	}

	conns.add(user);
	user.init();
});

// close a user connection
function exit(user) {
	user.stream.write(`\r\n${dim("goodbye \u{1f44b}")}\r\n`);
	user.stream.exit(0);
	user.stream.end();
	conns.delete(user);
	broadcast(dim(`=== ${user.name} left! ===`));	
}

// list commands
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
server.listen(8393);
