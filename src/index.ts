import {
    Plugin,
} from "siyuan";
import "./index.scss";
import { ICONS } from "./icons";
import { prog } from "./Progressive";
import { events } from "./Events";

export default class ThePlugin extends Plugin {
    onload() {
        this.addIcons(ICONS);
        events.onload(this);
        prog.onload(this);
    }

    onLayoutReady() {
        prog.onLayoutReady();
    }

    onunload() {
        console.log("unload progressive learning plugin");
    }
}