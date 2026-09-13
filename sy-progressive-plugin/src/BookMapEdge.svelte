<script lang="ts">
    // 打磨批（09-13 拥挤修复）知识地图自定义边：标签钉在 dagre 预留位（layoutPool
    // edgeLabels——预留带中心，永不压卡片）+ scurve 走线（vision 双形态对比定稿）：
    // 垂直出卡 → 水平过标签 → 垂直入卡。缺钉位兜底=xyflow 默认 bezier（标签随线心）。
    import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/svelte";

    let { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, style,
        interactionWidth }: EdgeProps = $props();

    const label = $derived(String((data as any)?.label ?? ""));
    const lx = $derived(Number((data as any)?.lx));
    const ly = $derived(Number((data as any)?.ly));

    const geo = $derived.by(() => {
        if (!label || !Number.isFinite(lx) || !Number.isFinite(ly)) {
            const [path, cx, cy] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
            return { path, cx, cy };
        }
        // 两段三次贝塞尔过 (lx,ly)：控制点把曲线抬成「竖出—横行—竖入」的 S 走廊
        const path = `M ${sourceX},${sourceY} C ${sourceX},${(sourceY + ly) / 2} ${lx},${(sourceY + ly) / 2} ${lx},${ly}` +
            ` C ${lx},${(ly + targetY) / 2} ${targetX},${(ly + targetY) / 2} ${targetX},${targetY}`;
        return { path, cx: lx, cy: ly };
    });
</script>

<BaseEdge {id} {style} path={geo.path} labelX={geo.cx} labelY={geo.cy} {label} {interactionWidth} />
