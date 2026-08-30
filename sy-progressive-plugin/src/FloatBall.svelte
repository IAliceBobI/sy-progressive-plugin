<script lang="ts">
    import { onMount } from "svelte";
    import { icon } from "../../sy-tomato-plugin/src/libs/utils";
    import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
    import type { FloatDocKind } from "./progFloatState";

    // v5 □5 悬浮球（收起态，docs/prog-v5-floatbar-design.md §2）：38px 中性壳 + 三态 glyph 微区分，
    // 无徽章无数字（到期数归浮条胶囊、欠债归状态栏火苗）；拖/点按位移 5px 区分；
    // 位置记忆独立键（浮条展开态用共享 FloatBar 的 posKey，互不干扰）。
    interface PropsType {
        kind: FloatDocKind;
        title: string;
        point?: number;
        onExpand: () => void;
    }
    let { kind, title, point = 0, onExpand }: PropsType = $props();

    const POS_KEY = "prog-floatball-pos";
    const GLYPH: Record<FloatDocKind, string> = {
        book: "iconProgBook",
        piece: "iconProgPiece",
        digest: "iconProgScissors",
        free: "iconProgScissors", // □11：free 出场恒展开，球态实际不可达，占位同 digest glyph
    };

    let ball: HTMLElement = $state();
    // □14 双浮条撞位：默认位与 recite 浮条 (200,200) 左上错开、落左下象限（渐进 v5 未发布
    // 无存量负担，recite 侧不动）；拖过一次后各自 localStorage 位置记忆，默认位只服务首场
    let x = $state(200);
    let y = $state(Math.max(0, window.innerHeight - 200));

    try {
        const pos = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
        if (pos?.x != null && pos?.y != null) {
            x = pos.x;
            y = pos.y;
        }
    } catch { /* 坏数据回默认位置 */ }

    function clamp() {
        if (!ball) return;
        x = Math.max(0, Math.min(x, Math.max(0, window.innerWidth - 38)));
        y = Math.max(0, Math.min(y, Math.max(0, window.innerHeight - 38)));
    }

    function save() {
        try {
            localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
        } catch { /* 存储不可用静默 */ }
    }

    let dragging = false;

    function startDrag(e: MouseEvent) {
        const offX = e.clientX - x;
        const offY = e.clientY - y;
        let moved = 0;
        dragging = true;
        const move = (ev: MouseEvent) => {
            moved = Math.max(moved, Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY));
            x = ev.clientX - offX;
            y = ev.clientY - offY;
            clamp();
        };
        const up = () => {
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", up);
            dragging = false;
            if (moved <= 5) {
                onExpand(); // 位移 ≤5px 视为点击：展开浮条
            } else {
                save();
            }
        };
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
    }

    function startDragTouch(e: TouchEvent) {
        const t = e.touches[0];
        const offX = t.clientX - x;
        const offY = t.clientY - y;
        let moved = 0;
        const move = (ev: TouchEvent) => {
            ev.preventDefault();
            const te = ev.touches[0];
            moved = Math.max(moved, Math.abs(te.clientX - t.clientX) + Math.abs(te.clientY - t.clientY));
            x = te.clientX - offX;
            y = te.clientY - offY;
            clamp();
        };
        const up = () => {
            document.removeEventListener("touchmove", move);
            document.removeEventListener("touchend", up);
            if (moved <= 5) onExpand();
            else save();
        };
        document.addEventListener("touchmove", move, { passive: false });
        document.addEventListener("touchend", up);
    }

    onMount(() => {
        clamp();
        const onResize = () => clamp();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    });

    const tip = $derived(
        kind === "piece"
            ? `《${title}》· ${tomatoI18n.分片} ${point + 1}`
            : kind === "digest"
                ? `《${title}》· ${tomatoI18n.摘抄}`
                : `《${title}》· ${tomatoI18n.渐进学习}`,
    );
</script>

<button
    class="prog-ball b3-tooltips b3-tooltips__n"
    aria-label={tip}
    bind:this={ball}
    style="left:{x}px;top:{y}px"
    onmousedown={startDrag}
    ontouchstart={startDragTouch}
    onclick={(e) => { if (!dragging) e.preventDefault(); }}
>{@html icon(GLYPH[kind], 18)}</button>

<style>
    .prog-ball {
        position: fixed;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        padding: 0;
        border: 1px solid var(--prog-card-border, var(--b3-border-color));
        border-radius: 50%;
        background: var(--prog-card-bg, var(--b3-theme-surface));
        box-shadow: var(--prog-shadow, var(--b3-point-shadow));
        color: var(--prog-accent, var(--b3-theme-primary));
        cursor: pointer;
        user-select: none;
        /* 10 = 浮层安全档（恒低于内核弹层最小 z11，高于 protyle 常驻 ≤9） */
        z-index: 10;
        animation: prog-ball-in 0.15s ease-out;
    }
    .prog-ball:hover {
        transform: translateY(-1px);
    }
    @keyframes prog-ball-in {
        from {
            opacity: 0;
            transform: scale(0.92);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }
</style>
