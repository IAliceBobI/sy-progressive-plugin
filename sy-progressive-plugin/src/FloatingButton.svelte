<!-- FloatingActionButton.svelte -->
<script lang="ts">
    import DigestProgressive from "./DigestProgressive.svelte";
    import { Plugin } from "siyuan";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import FloatBar from "../../sy-tomato-plugin/src/libs/FloatBar.svelte";

    interface Props {
        settings: TomatoSettings;
        plugin: Plugin;
        dm: DestroyManager;
        key: string;
    }

    // dm/key 由 FloatingAction.ts 传入（Props 接口保留），本组件已不再使用：
    // 摘抄浮条改由 FloatBar 自管位置，卸载清理走 FloatingBall 的 dm("sv"/"div")
    let {
        settings,
        plugin
    }: Props = $props();
</script>

<FloatBar posKey="prog-digest-floatbar-pos">
    <DigestProgressive {settings} {plugin} isFloating={true}
    ></DigestProgressive>
</FloatBar>
