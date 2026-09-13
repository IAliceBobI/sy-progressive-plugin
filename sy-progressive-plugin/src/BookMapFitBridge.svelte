<script lang="ts">
    // 打磨批（□8 P2「导出=当前视口裁剪」）：Provider 上下文桥——useSvelteFlow 只能在
    // SvelteFlowProvider 子组件里调（Dialog 本体是 Provider 父级拿不到），薄壳把
    // fitView/getViewport/setViewport 递给父级。{#key} 重建时 onReady 重发自刷新。
    import { onMount } from "svelte";
    import { useSvelteFlow } from "@xyflow/svelte";

    let { onReady }: {
        onReady: (api: {
            fitView: (opts?: { padding?: number; duration?: number }) => Promise<boolean>;
            getViewport: () => { x: number; y: number; zoom: number };
            setViewport: (v: { x: number; y: number; zoom: number }) => Promise<boolean>;
        }) => void;
    } = $props();

    const { fitView, getViewport, setViewport } = useSvelteFlow();
    onMount(() => {
        onReady({
            fitView: (o) => fitView(o),
            getViewport,
            setViewport: v => setViewport(v),
        });
    });
</script>
