<!-- FloatingActionButton.svelte -->
<script lang="ts">
    import { onMount } from "svelte";
    import DigestProgressive from "./DigestProgressive.svelte";
    import { Plugin } from "siyuan";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { FloatingBallHelper } from "../../sy-tomato-plugin/src/libs/FloatingBallHelper";

    interface Props {
        settings: TomatoSettings;
        plugin: Plugin;
        dm: DestroyManager;
        key: string;
    }

    let {
        settings,
        plugin,
        dm,
        key
    }: Props = $props();
    let div: HTMLElement = $state();

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
