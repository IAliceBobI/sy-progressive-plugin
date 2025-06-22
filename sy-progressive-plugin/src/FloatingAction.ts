import { Plugin } from "siyuan";
import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
import FloatingButton from "./FloatingButton.svelte"
import { FloatingBall } from "../../sy-tomato-plugin/src/FloatingBall";

const address = "progressive menu";

export function getProgFloatingDm() {
    return globalThis[FloatingBall.key(address)] as DestroyManager
}

export function createFloatingBtn(plugin: Plugin, settings: TomatoSettings) {
    const dm = globalThis[FloatingBall.key(address)] as DestroyManager
    if (dm) {
        return dm.getData("e")
    } else {
        const dm = FloatingBall.newProgFloatingDm(address);
        new FloatingBall(address, dm, (target) => {
            return new FloatingButton({
                target,
                props: {
                    plugin,
                    settings,
                    dm,
                    key: FloatingBall.key(address),
                }
            })
        });
        return dm.getData("e")
    }
}
