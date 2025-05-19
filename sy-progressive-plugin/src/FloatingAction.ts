import { Plugin } from "siyuan";
import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
import FloatingButton from "./FloatingButton.svelte"

const DMKey = "progressive_FloatingBtn_DMKey_MuTepw8eKDTziKHA9W2WQSt";

export function getProgFloatingDm() {
    return globalThis[DMKey] as DestroyManager
}

function newProgFloatingDm() {
    let dm = globalThis[DMKey] as DestroyManager
    dm?.destroyBy();
    dm = new DestroyManager()//(true,"btn");
    globalThis[DMKey] = dm;
    return dm;
}

export function createFloatingBtn(plugin: Plugin, settings: TomatoSettings) {
    const dm = newProgFloatingDm();
    const target = document.body.appendChild(document.createElement("div"));
    const sv = new FloatingButton({
        target,
        props: {
            plugin,
            settings,
            dm,
        }
    });
    dm.add("sv", () => sv.$destroy());
    dm.add("div", () => target.parentElement?.removeChild(target));
    dm.setData("e", target)
}
