import { Plugin } from "siyuan";
import { ICONS } from "./icons";
import { prog } from "./Progressive";
import { events } from "./Events";
import { flashBox } from "./FlashBox";

export default class ThePlugin extends Plugin {
    onload() {
        this.addIcons(ICONS);
        events.onload(this);
        prog.onload(this);
        flashBox.onload(this);
    }

    onLayoutReady() {
        prog.onLayoutReady();
    }

    onunload() {
        console.log("unload progressive learning plugin");
    }
}