// Zinc module for Chataigne: the typed side of examples/chataigne, a Zinc app that talks OSC.
// Incoming /zinc/... messages set this module's values (use them in mappings, conditions, state machines);
// the commands send /zinc/... messages back to the app. A few chat words act on the show, like the app's simulator.

var faders = [];
var toggles = [];

function init() {
	faders = [local.values.fader1, local.values.fader2, local.values.fader3, local.values.fader4];
	toggles = [local.values.toggle1, local.values.toggle2, local.values.toggle3];
	script.setUpdateRate(1);	// update() once a second: the heartbeat
}

// Heartbeat: keeps the app's link indicator on "Receiving" while Chataigne is up.
function update(deltaTime) {
	local.send("/zinc/ping");
}

function oscEvent(address, args) {
	var parts = address.split("/");	// "", "zinc", kind, index
	if (parts.length < 3 || parts[1] != "zinc") return;
	var kind = parts[2];
	var index = parts.length > 3 ? parseInt(parts[3]) : 0;
	if (kind == "fader" && index >= 1 && index <= faders.length) faders[index - 1].set(args[0]);
	else if (kind == "toggle" && index >= 1 && index <= toggles.length) toggles[index - 1].set(args[0] >= 1);
	else if (address == "/zinc/xy") local.values.xy.set([args[0], args[1]]);
	else if (address == "/zinc/color") local.values.color.set([args[0], args[1], args[2], 1]);
	else if (address == "/zinc/cue/go") local.values.cueGo.trigger();
	else if (address == "/zinc/cue/stop") local.values.cueStop.trigger();
	else if (address == "/zinc/chat") {
		local.values.chat.set(args[0]);
		local.values.chatReceived.trigger();
		chatCommand("" + args[0]);
	}
}

// "go", "stop", "blackout" and "full" as whole words in a chat message act on the show and answer in the chat.
function chatCommand(text) {
	var words = text.toLowerCase().split(" ");
	if (words.indexOf("blackout") >= 0) { allFaders(0); say("Blackout: all faders to 0."); }
	else if (words.indexOf("full") >= 0) { allFaders(1); say("Full: all faders to 100 %."); }
	else if (words.indexOf("stop") >= 0) { local.values.cueStop.trigger(); say("Stopping the cue."); }
	else if (words.indexOf("go") >= 0) { local.values.cueGo.trigger(); say("GO."); }
}

function allFaders(value) {
	for (var i = 1; i <= faders.length; i++) setFader(i, value);
}

// ---- commands (module.json "commands"), arguments in the order of their parameters
function setFader(index, value) { local.send("/zinc/fader/" + index, value); }
function setMeter(index, level) { local.send("/zinc/meter/" + index, level); }
function setToggle(index, state) { local.send("/zinc/toggle/" + index, state ? 1 : 0); }
function setXY(position) { local.send("/zinc/xy", position[0], position[1]); }
function setColor(color) { local.send("/zinc/color", color[0], color[1], color[2]); }
function setCueName(name) { local.send("/zinc/cue/name", name); }
function setCueRunning(running) { local.send("/zinc/cue/running", running ? 1 : 0); }
function say(message) { local.send("/zinc/chat", message); }
