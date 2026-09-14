<script lang="ts">
    // □8 知识地图 Dialog 容器：数据加载（读池+片三态+当前断点）→ 三态视图机
    // （全景=骨架分层+收簇 / views[] 用户视图 / 钻取=邻域 1 跳）→ SvelteFlow 渲染。
    // 点节点=钻取；双击=跳第一证据锚片；簇节点=该 type 展开视图；拖动坐标在
    // 「保存视图」时写进 views[].layout（主观切法持久化）。
    import { onMount, onDestroy } from "svelte";
    import { writable, get } from "svelte/store";
    import {
        SvelteFlow, SvelteFlowProvider, Controls, Background, MiniMap,
        type Node, type Edge,
    } from "@xyflow/svelte";
    import "@xyflow/svelte/dist/style.css";
    import { Dialog } from "siyuan";
    import type { Plugin } from "siyuan";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
    import { PDIGEST_CTIME, PROG_DONE_KEY } from "../../sy-tomato-plugin/src/libs/gconst";
    import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/navUtils";
    import BookMapNode from "./BookMapNode.svelte";
    import BookMapEdge from "./BookMapEdge.svelte";
    import BookMapFitBridge from "./BookMapFitBridge.svelte";
    import WritingTreeNode from "./WritingTreeNode.svelte";
    import { neighborhood, type BookMap, type MapNode } from "./bookMapCore";
    import { readPoolFront, collectPieceStats, saveView, jumpToPiece, type PieceStat } from "./bookMapFront";
    import {
        layoutPool, panoramaSpec, nodeProgress, nodeDegrees, edgeLabelOf, CORE_DEGREE,
    } from "./bookMapLayout";
    import { exportMapPng } from "./bookMapExport";
    import { progStorage } from "./ProgressiveStorage";
    import { fetchWritingTreeSlots } from "./writeTree";
    import {
        buildWritingProjection, layoutWritingTree, WMAP_COL_W, WMAP_ROW_H,
        type ProjectionSlot, type WritingProjection,
    } from "./writingTreeMapCore";

    let { plugin, bookID, onClose }: { plugin: Plugin; bookID: string; onClose?: () => void } = $props();

    type Mode =
        | { t: "pano" }
        | { t: "view"; name: string }
        | { t: "drill"; id: string }
        | { t: "cluster"; nodeType: string };

    let phase = $state<"loading" | "empty" | "error" | "ready">("loading");
    let pool = $state<BookMap | null>(null);
    let stats = new Map<number, PieceStat>();
    let curPoint = -1;
    let mode = $state<Mode>({ t: "pano" });
    // progtree □3 写作分派：writing=写作书（独立数据链+树投影；视图机/池链全不进）
    let writing = $state(false);
    let wproj: WritingProjection | null = null;
    let wpos = new Map<string, { x: number; y: number }>();
    let wheight = 0;
    // 用户拖动坐标（保存视图用；非响应式够用——保存时才读）
    const manualPos = new Map<string, { x: number; y: number }>();
    let flowEl = $state<HTMLElement>();

    const nodes = writable<Node[]>([]);
    const edges = writable<Edge[]>([]);
    const nodeTypes = { progMapNode: BookMapNode, wmapNode: WritingTreeNode };
    const edgeTypes = { progMapEdge: BookMapEdge };

    const readcardOf = (pt: number) => stats.get(pt)?.readcard;

    // 视图机。fitView 竞态根治：{#key} 重建必须发生在 nodes store 写入新值**之后**
    // （$effect 晚于 DOM flush——SvelteFlow mount 时读到旧节点集，fitView 按旧图算
    // 边界=新图跑出视口；而 effect 里写 $state 触发自身链=effect_update_depth_exceeded，
    // e2e+vision 双实锤）。正解=切换处理器同步先 buildGraph 再赋 mode，渲染 flush 时
    // store 已新、{#key} 亦新，fitView 拿到的就是当前图。
    const viewKey = $derived(
        mode.t === "view" ? `v:${mode.name}` :
        mode.t === "drill" ? `d:${mode.id}` :
        mode.t === "cluster" ? `c:${mode.nodeType}` : "pano");

    function setMode(m: Mode) {
        clearTimeout(drillTimer); // 显式切换作废 pending 单击（复评 P2：260ms 竞态）
        mode = m;
        if (phase === "ready" && pool) buildGraph();
    }

    // 关窗时 pending 单击的 dagre 空转不再落用户下一帧（复评 P2；onDestroy 由
    // DestroyManager "2" 的 unmount 触发，链路时序正确）
    onDestroy(() => clearTimeout(drillTimer));

    onMount(async () => {
        try {
            // 写作书分派（□3）：结构读口=fetchWritingTreeSlots 唯一通道（30s TTL 与
            // 调度/菜单共享），素材/done 两发 SQL 直查——视图机/池链/进度点亮全不进
            const winfo = progStorage.peekBookInfo(bookID);
            if (winfo?.writing) {
                writing = true;
                await loadWritingMap(winfo);
                return;
            }
            const [p, vols] = await Promise.all([
                readPoolFront(bookID),
                // onload 尾才绑定 this.plugin（懒注入）——极早打开窗口（onload 未完）
                // 会炸；卷表失败不阻断地图（只丢进度点亮），留 Loki 痕迹
                progStorage.loadVolTable(bookID).catch(e => {
                    debugLog("prog.bookmap", `volTable load failed: ${String(e)}`, "progressive");
                    return [] as Awaited<ReturnType<typeof progStorage.loadVolTable>>;
                }),
            ]);
            const info = progStorage.peekBookInfo(bookID);
            curPoint = Number.isInteger(info?.point) ? (info?.point as number) : -1;
            stats = await collectPieceStats(bookID, vols);
            if (!p || p.nodes.length === 0) {
                phase = "empty";
                return;
            }
            pool = p;
            phase = "ready";
            buildGraph();
            debugLog("prog.bookmap", `dialog ready book=${bookID} nodes=${p.nodes.length} pieces=${stats.size} point=${curPoint}`, "progressive");
        } catch (e) {
            console.error("bookmap dialog load failed", e);
            phase = "error";
        }
    });

    /** 写作书数据链：树槽（唯一读口）→ 素材/done 双 SQL → 投影+布局 → 建图。
     *  empty 判据=roots 空（书下没有槽文档）；拉取失败沿 fetchWritingTreeSlots 语义
     *  返 []（不缓存），与阅读链一样落 empty 提示重开重试 */
    async function loadWritingMap(info: { bookName?: string; boxID?: string }) {
        const slots = await fetchWritingTreeSlots(bookID, info);
        if (slots.length === 0) {
            phase = "empty";
            return;
        }
        const [matRows, doneRows] = await Promise.all([
            siyuan.sql(
                `select block_id from attributes where name='${PDIGEST_CTIME}'` +
                ` and (value like '${bookID}#%' or value like '🔨#${bookID}#%') limit 10000000`) as any,
            siyuan.sql(
                `select block_id, value from attributes where name='${PROG_DONE_KEY}'` +
                ` and block_id in (${slots.map(s => `'${s.docID}'`).join(",")}) limit 10000000`) as any,
        ]);
        wproj = buildWritingProjection(
            slots,
            new Set((matRows ?? []).map((r: any) => String(r.block_id))),
            new Set((doneRows ?? []).filter((r: any) => r.value === "1").map((r: any) => String(r.block_id))),
            bookID);
        if (wproj.roots.length === 0) {
            phase = "empty";
            return;
        }
        const laid = layoutWritingTree(wproj.roots);
        wpos = laid.positions;
        wheight = laid.height;
        phase = "ready";
        buildWritingGraph();
        const slotsTotal = wproj.roots.reduce((a, r) => a + r.subtreeSlots, 0);
        const matsTotal = wproj.roots.reduce((a, r) => a + r.subtreeMaterials, 0);
        const gapsTotal = wproj.roots.reduce((a, r) => a + r.subtreeGaps, 0);
        debugLog("prog.wmap", `dialog ready book=${bookID} slots=${slotsTotal} materials=${matsTotal} gaps=${gapsTotal} pool=${wproj.poolCount}`, "progressive");
    }

    /** 写作树建图：合成根（书名+汇总）+槽节点+父子边；坐标=layoutWritingTree */
    function buildWritingGraph() {
        if (!wproj) return;
        const rootID = `wroot:${bookID}`;
        const slotsTotal = wproj.roots.reduce((a, r) => a + r.subtreeSlots, 0);
        const matsTotal = wproj.roots.reduce((a, r) => a + r.subtreeMaterials, 0);
        const gapsTotal = wproj.roots.reduce((a, r) => a + r.subtreeGaps, 0);
        const info = progStorage.peekBookInfo(bookID);
        const flowNodes: Node[] = [{
            id: rootID,
            type: "wmapNode",
            position: { x: -WMAP_COL_W, y: Math.max(0, (wheight - WMAP_ROW_H) / 2) },
            data: {
                kind: "wroot",
                title: info?.bookName ?? bookID,
                summary: tomatoI18n.结构汇总(slotsTotal, matsTotal, gapsTotal, wproj.poolCount),
            },
            draggable: true,
        }];
        const flowEdges: Edge[] = [];
        const edgeStyle = "stroke: color-mix(in srgb, var(--b3-theme-on-surface) 18%, transparent); stroke-width: 1.5px;";
        const walk = (n: ProjectionSlot, parent: string) => {
            flowNodes.push({
                id: n.docID,
                type: "wmapNode",
                position: wpos.get(n.docID) ?? { x: 0, y: 0 },
                data: {
                    kind: "wslot",
                    title: n.title,
                    materialCount: n.materialCount,
                    childCount: n.childSlots.length,
                    done: n.done,
                    gap: n.gap,
                },
                draggable: true,
            });
            flowEdges.push({ id: `we:${parent}:${n.docID}`, source: parent, target: n.docID, style: edgeStyle });
            for (const c of n.childSlots) walk(c, n.docID);
        };
        wproj.roots.forEach(r => walk(r, rootID));
        nodes.set(flowNodes);
        edges.set(flowEdges);
    }

    function nodeDataOf(n: MapNode) {
        const deg = degrees.get(n.id) ?? 0;
        return {
            kind: "node" as const,
            name: n.name,
            type: n.type,
            typeLabel: tomatoI18n.地图节点类型(n.type),
            summary: n.summary,
            progress: nodeProgress(n.anchors, curPoint, readcardOf),
            core: deg >= CORE_DEGREE,
            cancelClick: () => clearTimeout(drillTimer),
            dblclick: () => {
                void jumpToPiece(plugin, n.anchors, stats).then(ok => {
                    if (!ok) void siyuan.pushMsg(tomatoI18n.无证据锚提示(), 2500);
                    else onClose?.(); // 跳片=去看原文，关 Dialog 让位（review P2-11）
                });
            },
        };
    }

    let degrees = new Map<string, number>();

    /** 三态视图机分派：全景（收簇）/视图/钻取/type 展开各自组装 nodes+edges */
    function buildGraph() {
        if (!pool) return;
        degrees = nodeDegrees(pool);
        const byID = new Map(pool.nodes.map(n => [n.id, n]));

        let ids: string[];
        let pos: Map<string, { x: number; y: number }>;
        let edgeLabels = new Map<number, { x: number; y: number }>();
        let extraNodes: Node[] = [];

        if (mode.t === "pano") {
            const spec = panoramaSpec(pool);
            ids = spec.visibleIDs;
            ({ nodes: pos, edgeLabels } = layoutPool(pool, ids));
            // 簇节点摆在全景右侧一列（dagre 外手动坐标，点开=该 type 展开视图）
            const maxX = Math.max(0, ...[...pos.values()].map(p => p.x));
            spec.clusters.forEach((c, i) => {
                extraNodes.push({
                    id: `cluster:${c.type}`,
                    type: "progMapNode",
                    position: { x: maxX + 280, y: i * 96 },
                    data: {
                        kind: "cluster",
                        name: tomatoI18n.地图簇标签(c.type, c.ids.length),
                        clusterCount: c.ids.length,
                    },
                    draggable: true,
                });
            });
        } else if (mode.t === "view") {
            const mName = mode.name; // 闭包内 TS 放弃对捕获 let 的 narrow，先解出
            const v = pool.views.find(x => x.name === mName);
            ids = v ? [...new Set(v.nodeIDs)].filter(id => byID.has(id)) : [];
            ({ nodes: pos, edgeLabels } = layoutPool(pool, ids));
            // 已存坐标回放（缺的 dagre 补——书编辑后节点新增/视图旧坐标悬空自然回落）
            if (v?.layout) {
                for (const [id, p] of Object.entries(v.layout as Record<string, { x: number; y: number }>)) {
                    if (typeof p?.x === "number" && typeof p?.y === "number") pos.set(id, p);
                }
            }
            // 用户本轮拖过的坐标优先
            for (const [id, p] of manualPos) if (pos.has(id)) pos.set(id, p);
        } else if (mode.t === "drill") {
            const sub = neighborhood(pool, mode.id);
            ids = sub.nodes.map(n => n.id);
            ({ nodes: pos, edgeLabels } = layoutPool(pool, ids));
        } else {
            const mType = mode.nodeType; // 同上：闭包捕获前先解出
            ids = pool.nodes.filter(n => n.type === mType).map(n => n.id);
            ({ nodes: pos, edgeLabels } = layoutPool(pool, ids));
        }

        const idSet = new Set(ids);
        const flowNodes: Node[] = ids.map(id => {
            const n = byID.get(id)!;
            const p = pos.get(id) ?? { x: 0, y: 0 };
            return {
                id,
                type: "progMapNode",
                position: p,
                data: nodeDataOf(n),
                draggable: true,
            };
        });
        const flowEdges: Edge[] = pool.edges
            .map((e, i) => ({ e, i }))
            .filter(({ e }) => idSet.has(e.from) && idSet.has(e.to))
            .map(({ e, i }) => {
                const lp = edgeLabels.get(i);
                return {
                    id: `e${i}`,
                    type: "progMapEdge",
                    source: e.from,
                    target: e.to,
                    // 标签钉 dagre 预留位（lx/ly 缺席=组件内兜底默认 bezier 随线心）
                    data: { label: edgeLabelOf(e.relation), lx: lp?.x, ly: lp?.y },
                    zIndex: 1, // 边层浮节点上：边线 18% 透明穿卡近隐形（标签已由预留位避卡）
                    style: "stroke: color-mix(in srgb, var(--b3-theme-on-surface) 18%, transparent); stroke-width: 1.5px;",
                    // 打磨批（vision P2）：xyflow 标签默认白底（暗色分支要 .dark 类才切 #141414
                    // ——我们不挂）——CSS 变量面接管见 :global(.svelte-flow__edge-label)
                };
            });
        nodes.set([...flowNodes, ...extraNodes]);
        edges.set(flowEdges);
    }

    // 单击延迟确认（review P1-2）：单击立即重建画布会让双击第二击打在重建后的
    // 空白/错节点上=跳片静默失败。260ms 窗内来了 dblclick 即取消单击钻取。
    let drillTimer: ReturnType<typeof setTimeout> | undefined;
    function onNodeClick({ node }: { node: Node; event: MouseEvent | TouchEvent }) {
        // 写作分派：单击槽=跳槽文档（树全展开无钻取无双击竞态，root 无动作）；
        // 跳=去看素材原文，关 Dialog 让位（阅读链 dblclick 同款语义）
        if (writing) {
            clearTimeout(drillTimer);
            if (node.id.startsWith("wroot:")) return;
            void OpenSyFile2(plugin, node.id).then(() => onClose?.());
            return;
        }
        const go = (node.data as any)?.kind === "cluster"
            ? () => setMode({ t: "cluster", nodeType: String(node.id).split(":")[1] ?? "theme" })
            : () => setMode({ t: "drill", id: node.id });
        clearTimeout(drillTimer);
        drillTimer = setTimeout(go, 260);
    }

    function onNodeDragStop({ targetNode, nodes }: { targetNode: Node | null; nodes: Node[]; event: MouseEvent | TouchEvent }) {
        // 多选拖动路径 targetNode=null（库 NodeSelection 实锤）——回退 nodes 全集，
        // 集体拖动的每个节点坐标都采集（review P1-1）
        for (const n of targetNode ? [targetNode] : (nodes ?? [])) {
            manualPos.set(n.id, { ...n.position });
        }
    }

    // ---- 视图切换/保存/导出 ----
    const viewSel = $derived(mode.t === "view" ? mode.name : "");

    function onViewChange(ev: Event) {
        const v = (ev.target as HTMLSelectElement).value;
        manualPos.clear();
        setMode(v === "__pano__" ? { t: "pano" } : { t: "view", name: v });
    }

    let viewSaving = false;
    function saveCurrentView() {
        if (!pool || viewSaving) return;
        viewSaving = true;
        const dialog = new Dialog({
            title: tomatoI18n.保存视图(),
            content: `<div style="display:flex;gap:8px;align-items:center;padding:4px 0">
  <input class="b3-text-field fn__flex-1" data-bmv-name placeholder="" maxlength="60">
  <button class="b3-button b3-button--primary" data-bmv-ok>OK</button>
</div>`,
            width: "min(420px, 92vw)",
            destroyCallback: () => { viewSaving = false; },
        });
        const input = dialog.element.querySelector<HTMLInputElement>("[data-bmv-name]");
        const ok = dialog.element.querySelector<HTMLButtonElement>("[data-bmv-ok]");
        if (!input || !ok) { dialog.destroy(); return; }
        input.placeholder = tomatoI18n.视图名称占位();
        let busy = false;
        const submit = async () => {
            if (busy) return;
            const name = input.value.trim();
            if (!name) return;
            busy = true;
            // 当前可见节点集+坐标（手动优先，缺的用当前布局坐标）
            const cur = get(nodes);
            const nodeIDs = cur.filter(n => (n.data as any)?.kind !== "cluster").map(n => n.id);
            const layout: Record<string, { x: number; y: number }> = {};
            for (const n of cur) {
                if ((n.data as any)?.kind === "cluster") continue;
                layout[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
            }
            ok.disabled = true;
            const okSave = await saveView(bookID, { name, nodeIDs, layout });
            dialog.destroy();
            if (okSave) {
                void siyuan.pushMsg(tomatoI18n.视图已保存(), 2500);
                // 刷新本地池子 views（免重读：saveView 语义=同名替换/push）
                const saved = { name, nodeIDs, layout };
                const others = (pool?.views ?? []).filter(v => v.name !== name);
                pool = pool ? { ...pool, views: [...others, saved] } : pool;
                manualPos.clear();
                setMode({ t: "view", name }); // 下拉选中态与画布一致（review P1-3）
            } else {
                void siyuan.pushMsg(tomatoI18n.视图保存失败(), 2500);
            }
        };
        ok.addEventListener("click", () => void submit());
        input.addEventListener("keydown", ev => {
            if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); void submit(); }
        });
        setTimeout(() => input.focus(), 50);
    }

    let exporting = $state(false);
    // 打磨批（□8 P2）：视口 API 桥（BookMapFitBridge onReady 注入；{#key} 重建自刷新）
    let flowApi: {
        fitView: (opts?: { padding?: number; duration?: number }) => Promise<boolean>;
        getViewport: () => { x: number; y: number; zoom: number };
        setViewport: (v: { x: number; y: number; zoom: number }) => Promise<boolean>;
    } | null = null;
    async function onExport() {
        if (!flowEl || exporting) return;
        exporting = true;
        // 导出前 fitView 全景：视口裁剪改全景完整化（用户平移/缩放后截当前可见区=画布
        // 外节点丢）；导出后还原用户视口（fitView 只动 transform 不动节点坐标）。双跳
        // 等 transform 落 DOM 再进截图段
        const prevVp = flowApi?.getViewport();
        try {
            if (flowApi) {
                await flowApi.fitView({ padding: 0.15, duration: 0 });
                await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
            }
            const fname = `${writing ? "结构树" : "知识地图"}-${new Date().toISOString().slice(0, 10)}.png`;
            const ok = await exportMapPng(flowEl, fname);
            if (!ok) void siyuan.pushMsg(tomatoI18n.导出图片失败(), 2500);
        } finally {
            if (prevVp) void flowApi?.setViewport(prevVp);
            exporting = false;
        }
    }
</script>

<div class="prog-map-dialog">
    {#if phase === "loading"}
        <div class="prog-map-hint">{tomatoI18n.加载中}</div>
    {:else if phase === "empty"}
        <div class="prog-map-hint">{writing ? tomatoI18n.暂无结构数据() : tomatoI18n.暂无地图数据()}</div>
    {:else if phase === "error"}
        <div class="prog-map-hint">{tomatoI18n.地图加载失败()}</div>
    {:else if writing}
        <div class="prog-map-toolbar">
            <span class="fn__flex-1"></span>
            <button class="b3-button b3-button--outline" onclick={() => void onExport()} disabled={exporting}>{tomatoI18n.导出图片}</button>
        </div>
        <div class="prog-map-flow" bind:this={flowEl}>
            {#key viewKey}
                <SvelteFlowProvider>
                    <BookMapFitBridge onReady={api => { flowApi = api; }} />
                    <SvelteFlow
                        bind:nodes={$nodes}
                        bind:edges={$edges}
                        {nodeTypes}
                        {edgeTypes}
                        minZoom={0.08}
                        fitView
                        fitViewOptions={{ padding: 0.2, maxZoom: 1.25 }}
                        onnodeclick={onNodeClick}
                        onnodedragstop={onNodeDragStop}
                    >
                        <Controls showLock={true} />
                        <Background gap={25} size={1.2} />
                        {#if $nodes.length >= 30}
                            <MiniMap pannable zoomable width={130} height={94} />
                        {/if}
                    </SvelteFlow>
                </SvelteFlowProvider>
            {/key}
        </div>
    {:else if pool}
        <div class="prog-map-toolbar">
            <select class="b3-select prog-map-viewsel" onchange={onViewChange} disabled={mode.t === "drill" || mode.t === "cluster"} aria-label={tomatoI18n.保存视图()}>
                <option value="__pano__" selected={viewSel === ""}>{tomatoI18n.全景图()}</option>
                {#each pool.views as v (v.name)}
                    <option value={v.name} selected={viewSel === v.name}>{v.name}</option>
                {/each}
            </select>
            {#if mode.t !== "pano"}
                <button class="b3-button b3-button--outline" onclick={() => { manualPos.clear(); setMode({ t: "pano" }); }}>
                    {tomatoI18n.返回全景()}
                </button>
            {/if}
            <span class="fn__flex-1"></span>
            <button class="b3-button b3-button--outline" onclick={saveCurrentView}>{tomatoI18n.保存视图()}</button>
            <button class="b3-button b3-button--outline" onclick={() => void onExport()} disabled={exporting}>{tomatoI18n.导出图片}</button>
        </div>
        {#if pool.views.length >= 6}
            <div class="prog-map-tidyhint">{tomatoI18n.视图整理提示()}</div>
        {/if}
        <div class="prog-map-flow" bind:this={flowEl}>
            {#key viewKey}
                <SvelteFlowProvider>
                    <BookMapFitBridge onReady={api => { flowApi = api; }} />
                    <SvelteFlow
                        bind:nodes={$nodes}
                        bind:edges={$edges}
                        {nodeTypes}
                        {edgeTypes}
                        minZoom={0.08}
                        fitView
                        fitViewOptions={{ padding: 0.2, maxZoom: 1.25 }}
                        onnodeclick={onNodeClick}
                        onnodedragstop={onNodeDragStop}
                    >
                        <Controls showLock={true} />
                        <Background gap={25} size={1.2} />
                        {#if $nodes.length >= 30}
                            <MiniMap pannable zoomable width={130} height={94} />
                        {/if}
                    </SvelteFlow>
                </SvelteFlowProvider>
            {/key}
        </div>
    {/if}
</div>

<style>
    .prog-map-dialog {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }
    .prog-map-hint {
        padding: 32px 20px;
        color: var(--b3-theme-on-surface);
        opacity: 0.65;
        font-size: 13px;
        line-height: 1.7;
    }
    .prog-map-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px 8px;
        flex-shrink: 0;
    }
    .prog-map-viewsel {
        max-width: 180px;
    }
    /* □9 整理入口轻提示：视图 ≥6 张才出现的一行指路（不藏 hover）。
       vision 两轮：11px/0.62 对比度 2.6:1 不达标 → 12px；0.9 亮色 4.498:1 压线差
       0.002 → 0.92（亮 4.70/暗 4.72 双过线，视觉无感差异） */
    .prog-map-tidyhint {
        padding: 0 8px 6px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.92;
        flex-shrink: 0;
    }
    .prog-map-flow {
        flex: 1;
        min-height: 0;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        overflow: hidden;
        /* □14：xyflow 控件条跟主题（默认白底浅灰图标在暗色画布上扎眼——官方 CSS
           变量覆盖通道，hover 用 surface 的深一档 blend） */
        --xy-controls-button-background-color: var(--b3-theme-surface);
        --xy-controls-button-color: var(--b3-theme-on-surface);
        --xy-controls-button-border-color: var(--b3-border-color);
        --xy-controls-button-background-color-hover: color-mix(in srgb, var(--b3-theme-surface) 88%, var(--b3-theme-on-surface));
    }
    /* xyflow 边标签底色跟主题（默认白底在暗色扎眼）。打磨批修正：svelte 版渲染的是
       DIV .svelte-flow__edge-label（--xy-edge-label-background-color 默认白；暗色分支
       要 .dark 类才切，我们不挂）——原 __edge-textbg/__edge-text 是 react 版类名恒不命中 */
    .prog-map-flow :global(.svelte-flow__edge-label) {
        fill: none;
        color: var(--b3-theme-on-surface);
        background: color-mix(in srgb, var(--b3-theme-surface) 92%, var(--b3-theme-on-surface));
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius, 4px);
        font-size: 11px;
        line-height: 1.4;
        padding: 1px 5px;
    }
    .prog-map-flow :global(.svelte-flow__handle) {
        opacity: 0;
        min-width: 4px;
        min-height: 4px;
    }
</style>
