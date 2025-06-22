<!-- FloatingActionButton.svelte -->
<script lang="ts">
    import { onMount } from "svelte";
    import DigestProgressive from "./DigestProgressive.svelte";
    import { Plugin } from "siyuan";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { FloatingBallHelper } from "../../sy-tomato-plugin/src/libs/FloatingBallHelper";

    export let settings: TomatoSettings;
    export let plugin: Plugin;
    export let dm: DestroyManager;
    export let key: string;
    let div: HTMLElement;

    onMount(() => {
        new FloatingBallHelper(key, div, dm);
    });
</script>

<div class="floating-button" bind:this={div}>
    <DigestProgressive {settings} {plugin} isFloating={true}
    ></DigestProgressive>
</div>

<style>
    .floating-button {
        z-index: 10;
        position: fixed;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }
</style>
