<script lang="ts">
    import { Protyle } from "siyuan";
    import { onDestroy, onMount } from "svelte";
    import { DestroyManager } from "./libs/destroyer";
    import { TomatoClockID, tomatoClock } from "./TomatoClock";
    import { tomato_clocks_audio } from "./libs/stores";

    interface Props {
        vedioID: BlockID;
        dm: DestroyManager;
    }

    let { vedioID, dm }: Props = $props();
    let protyleTarget: HTMLDivElement = $state();

    let handleEscapePress = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            dm?.destroyBy();
        }
    };

    onMount(async () => {
        // 播放声音
        if (tomato_clocks_audio.get()) {
            const audio = new Audio(tomato_clocks_audio.get());
            try {
                audio.play();
            } catch (e) {
                console.error("Failed to play audio:", e);
            }
            dm?.add("close audio", () => {
                audio.pause();
                audio.currentTime = 0;
            });
        }
        if (dm) {
            window.addEventListener("keydown", handleEscapePress);
            dm.add("Escape Key Lisener", () =>
                window.removeEventListener("keydown", handleEscapePress),
            );
        }
        if (vedioID) {
            const protyle = new Protyle(tomatoClock.plugin.app, protyleTarget, {
                blockId: vedioID,
                action: ["cb-get-focus"],
                render: {
                    background: false,
                    title: false,
                    gutter: false,
                    scroll: false,
                    breadcrumb: false,
                    breadcrumbDocName: false,
                },
            });
            dm.add("protyle", () => protyle.destroy());
        }
    });
    export function destroy() {
        dm.destroyBy("svelte");
    }
    onDestroy(destroy);
</script>

<!-- https://learn.svelte.dev/tutorial/if-blocks -->
<div id={TomatoClockID}>
    {#if !vedioID}
        <div class="box">
            <div class="prompt">{tomatoClock.plugin.i18n.takeARestPlease}</div>
        </div>
    {:else}
        <div bind:this={protyleTarget}></div>
    {/if}
</div>

<style>
    .prompt {
        font-size: x-large;
    }
    .box {
        display: flex;
        justify-content: center; /* 水平居中 */
        align-items: center; /* 垂直居中 */
        height: 300px;
        width: 300px;
    }
</style>
