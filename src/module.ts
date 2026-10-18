import { TokenPF2e } from "@7h3laughingman/pf2e-types";

const MODULE_ID = "pf2e-fat-flanking";
Hooks.once("ready", init);

function grid2d(bounds: PIXI.Rectangle, a: number) {
    const s = Math.round(bounds.width / a);
    return Array.from({ length: s * s }, (_, i) => {
        const dx = Math.floor(i / s);
        const dy = i % s;
        return new PIXI.Point(
            bounds.left + a * (dx + 0.5),
            bounds.top + a * (dy + 0.5),
        );
    });
}

function findFlankingPoints(
    flankerA: TokenPF2e,
    flankerB: TokenPF2e,
    flankee: TokenPF2e,
    grid: Scene["grid"],
) {
    const Ray = foundry.canvas.geometry.Ray;
    const bounds = flankee.mechanicalBounds;
    const flankeeCenter = {
        x: (bounds.left + bounds.right) / 2,
        y: (bounds.top + bounds.bottom) / 2,
        elevation: flankee.document.elevation,
    };
    const left = new Ray(
        { x: bounds.left, y: bounds.top },
        { x: bounds.left, y: bounds.bottom },
    );
    const right = new Ray(
        { x: bounds.right, y: bounds.top },
        { x: bounds.right, y: bounds.bottom },
    );
    const top = new Ray(
        { x: bounds.left, y: bounds.top },
        { x: bounds.right, y: bounds.top },
    );
    const bottom = new Ray(
        { x: bounds.left, y: bounds.bottom },
        { x: bounds.right, y: bounds.bottom },
    );

    const reachA = flankerA.actor?.getReach({}) ?? 5;
    const reachB = flankerB.actor?.getReach({}) ?? 5;

    const gridA = grid2d(flankerA.mechanicalBounds, grid.size).filter(
        (p) =>
            grid.measurePath([
                { ...p, elevation: flankerA.document.elevation },
                flankeeCenter,
            ]).distance <= reachA,
    );
    const gridB = grid2d(flankerB.mechanicalBounds, grid.size).filter(
        (p) =>
            grid.measurePath([
                { ...p, elevation: flankerA.document.elevation },
                flankeeCenter,
            ]).distance <= reachB,
    );

    const intersectsSide = (
        side: fc.geometry.Ray,
        a: PIXI.Point,
        b: PIXI.Point,
    ): boolean => foundry.utils.lineSegmentIntersects(a, b, side.A, side.B);

    const sortingFunction = (
        a: { a: { x: number; y: number }; b: { x: number; y: number } },
        b: { a: { x: number; y: number }; b: { x: number; y: number } },
    ) => {
        return (
            Math.abs(a.a.x - a.b.x) +
            Math.abs(a.a.y - a.b.y) -
            (Math.abs(b.a.x - b.b.x) + Math.abs(b.a.y - b.b.y))
        );
    };

    const pairs = gridA
        .flatMap((a) => gridB.map((b) => ({ a, b })))
        .toSorted(sortingFunction);

    for (const { a, b } of pairs) {
        if (
            (intersectsSide(left, a, b) && intersectsSide(right, a, b)) ||
            (intersectsSide(top, a, b) && intersectsSide(bottom, a, b))
        ) {
            return { a, b };
        }
    }
    return null;
}

function init() {
    libWrapper.register(
        MODULE_ID,
        "CONFIG.Token.objectClass.prototype.onOppositeSides",
        function (
            this: TokenPF2e,
            wrapped: TokenPF2e["onOppositeSides"],
            flankerA: TokenPF2e,
            flankerB: TokenPF2e,
            flankee: TokenPF2e,
        ) {
            const grid = flankerA.scene?.grid;
            if (!grid?.isSquare) return wrapped(flankerA, flankerB, flankee);

            return !!findFlankingPoints(flankerA, flankerB, flankee, grid);
        },
        "MIXED",
    );
}

Hooks.once("refreshToken", (token: TokenPF2e) => {
    globalThis.__ffHighlight = token.flankingHighlight;

    libWrapper.register(
        MODULE_ID,
        "__ffHighlight.__proto__.drawForTarget",
        function (wrapped, target: TokenPF2e) {
            const grid = this.token.grid ?? canvas.scene?.grid;
            const pairs = this.token
                .buddiesFlanking(target, {
                    ignoreFlankable: true,
                })
                .map((b) => findFlankingPoints(this.token, b, target, grid))
                .filter(Boolean);
            const oToken = this.token;
            for (const { a, b } of pairs) {
                this.token = { layer: this.token.layer, center: a };
                this.drawBuddyLine({ center: b });
            }
            this.token = oToken;
        },
    );
});
