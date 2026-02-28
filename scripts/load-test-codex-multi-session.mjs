#!/usr/bin/env node
/**
 * Load Test: 10 Distinct Queries → Codex 5.2 in Separate Concurrent Sessions
 *
 * Fires 10 distinct prompts to gpt-5.2-codex simultaneously,
 * each in its own session, to stress-test multi-session concurrency.
 *
 * What it tests:
 * - 10 concurrent Pi RPC sessions running at the same time
 * - Each session receives only its own output (no cross-talk)
 * - All sessions complete with exit events
 * - Background streaming works for all sessions
 *
 * Usage:
 *   # Start server first:
 *   npm run dev
 *
 *   # Then run the load test:
 *   node scripts/load-test-codex-multi-session.mjs
 *
 *   # Override model (e.g. codex-mini):
 *   CODEX_MODEL=gpt-5.1-codex-mini node scripts/load-test-codex-multi-session.mjs
 *
 *   # Override server URL:
 *   SERVER_URL=http://192.168.1.100:3456 node scripts/load-test-codex-multi-session.mjs
 *
 *   # Adjust timeout (default 10 min):
 *   TIMEOUT_MS=900000 node scripts/load-test-codex-multi-session.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { EventSource } = require("eventsource");

// ── Configuration ──────────────────────────────────────────────────────────
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3456";
const CODEX_MODEL = process.env.CODEX_MODEL || "gpt-5.2-codex";
const PROVIDER = "codex";
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || "600000", 10); // 10 min default
const STAGGER_MS = parseInt(process.env.STAGGER_MS || "1000", 10); // stagger start by 1s
const CWD = process.env.CWD_PROJECT || "/Users/yifanxu/machine_learning/LoVC/vce_test_space/number";

// ── 10 Distinct Queries ────────────────────────────────────────────────────
const PROMPTS = [
    {
        label: "Q01-FibonacciScript",
        prompt: `Create a file called fibonacci.js that implements the Fibonacci sequence. The script should:
1. Export a function fibonacci(n) that returns the nth Fibonacci number using memoization for efficiency.
2. Export a function fibonacciSequence(n) that returns an array of the first n Fibonacci numbers.
3. Include a main block that prints the first 20 Fibonacci numbers when run directly with node.
4. Add comprehensive JSDoc comments explaining the algorithm and time complexity.
5. Handle edge cases: negative numbers should throw an error, 0 returns 0, 1 returns 1.
In your final reply, include this exact verification token: {TOKEN}`,
    },
    {
        label: "Q02-PrimeNumbers",
        prompt: `Create a file called primes.js that implements various prime number algorithms:
1. isPrime(n) — checks if a number is prime using trial division up to sqrt(n).
2. sieveOfEratosthenes(limit) — returns all primes up to the given limit using the Sieve of Eratosthenes.
3. nthPrime(n) — returns the nth prime number.
4. primeFactorization(n) — returns the prime factorization of n as an array of [prime, exponent] pairs.
5. Include a main block that demonstrates all functions with example outputs.
6. Add detailed comments explaining the time and space complexity of each algorithm.
In your final reply, include this exact verification token: {TOKEN}`,
    },
    {
        label: "Q03-SortingAlgorithms",
        prompt: `Create a file called sorting.js that implements and compares multiple sorting algorithms:
1. bubbleSort(arr) — classic bubble sort with optimization for early termination.
2. mergeSort(arr) — recursive merge sort implementation.
3. quickSort(arr) — quicksort with median-of-three pivot selection.
4. heapSort(arr) — heapsort using a max-heap.
5. insertionSort(arr) — insertion sort.
6. A benchmark function that generates random arrays of sizes [100, 1000, 10000] and times each algorithm.
7. Include a main block that runs the benchmark and prints a formatted comparison table.
All functions should sort in ascending order and not mutate the original array.
In your final reply, include this exact verification token: {TOKEN}`,
    },
    {
        label: "Q04-LinkedList",
        prompt: `Create a file called linked-list.js that implements a doubly linked list data structure:
1. A Node class with value, next, and prev properties.
2. A DoublyLinkedList class with methods: append, prepend, insertAt, removeAt, find, reverse, toArray, size, isEmpty, clear.
3. Implement Symbol.iterator so the list is iterable with for...of loops.
4. Add a toString() method that displays the list as: "1 <-> 2 <-> 3".
5. Include comprehensive error handling for out-of-bounds indices.
6. Add a main block demonstrating all operations.
7. Include JSDoc comments on every method.
In your final reply, include this exact verification token: {TOKEN}`,
    },
    {
        label: "Q05-MatrixMath",
        prompt: `Create a file called matrix.js that implements matrix operations:
1. A Matrix class that stores a 2D array of numbers.
2. Methods: add, subtract, multiply (matrix × matrix), scalarMultiply, transpose, determinant (for 2×2 and 3×3), inverse (for 2×2).
3. Static methods: identity(n) to create an n×n identity matrix, zeros(rows, cols), random(rows, cols).
4. A pretty-print method that displays the matrix in aligned columns.
5. Validate dimensions in all operations and throw descriptive errors on mismatch.
6. Include a main block that demonstrates all operations with example matrices.
In your final reply, include this exact verification token: {TOKEN}`,
    },
    {
        label: "Q06-BinarySearchTree",
        prompt: `Create a file called bst.js that implements a binary search tree:
1. A TreeNode class with value, left, right properties.
2. A BST class with methods: insert, search, delete, min, max, height, isBalanced.
3. Traversal methods: inOrder, preOrder, postOrder, levelOrder — each returning an array.
4. A visualize() method that prints a simple ASCII tree representation.
5. A fromArray(arr) static method to build a balanced BST from a sorted array.
6. Handle duplicate values by ignoring them.
7. Include a main block building a tree from [5, 3, 7, 1, 4, 6, 8, 2] and demonstrating all methods.
In your final reply, include this exact verification token: {TOKEN}`,
    },
    {
        label: "Q07-GraphAlgorithms",
        prompt: `Create a file called graph.js that implements a graph with common algorithms:
1. A Graph class supporting both directed and undirected graphs using an adjacency list.
2. Methods: addVertex, addEdge (with optional weight), removeVertex, removeEdge, hasVertex, hasEdge, getNeighbors.
3. BFS(start) and DFS(start) traversal methods returning arrays of visited vertices.
4. shortestPath(start, end) using Dijkstra's algorithm for weighted graphs.
5. hasCycle() to detect cycles in the graph.
6. topologicalSort() for directed acyclic graphs.
7. Include a main block demonstrating each algorithm with a sample graph.
In your final reply, include this exact verification token: {TOKEN}`,
    },
    {
        label: "Q08-StatisticsLib",
        prompt: `Create a file called statistics.js that implements a statistics library:
1. Basic: mean, median, mode, range, min, max, sum, count.
2. Dispersion: variance, standardDeviation, coefficientOfVariation, interquartileRange.
3. Correlation: pearsonCorrelation(x, y), covariance(x, y).
4. A histogram(data, bins) function that returns bucket counts.
5. A describe(data) function that returns a summary object with all basic and dispersion statistics.
6. A percentile(data, p) function.
7. All functions should validate input and throw errors for empty arrays or invalid arguments.
8. Include a main block with sample datasets demonstrating all functions.
In your final reply, include this exact verification token: {TOKEN}`,
    },
    {
        label: "Q09-NumberConverter",
        prompt: `Create a file called converter.js that converts between number bases and formats:
1. decimalToBinary(n), binaryToDecimal(s), decimalToHex(n), hexToDecimal(s), decimalToOctal(n), octalToDecimal(s).
2. A general convertBase(value, fromBase, toBase) function supporting bases 2-36.
3. romanToDecimal(s) and decimalToRoman(n) for Roman numeral conversion (1-3999).
4. numberToWords(n) that converts integers (up to 999,999) to English words (e.g., 42 → "forty-two").
5. Validate all inputs and throw descriptive errors.
6. Include a main block demonstrating all conversions with varied examples.
In your final reply, include this exact verification token: {TOKEN}`,
    },
    {
        label: "Q10-MathPuzzles",
        prompt: `Create a file called puzzles.js that solves classic math puzzles programmatically:
1. towerOfHanoi(n) — prints the steps to solve the Tower of Hanoi with n disks.
2. nQueens(n) — finds all solutions to the N-Queens problem and returns them as 2D board arrays.
3. magicSquare(n) — generates an n×n magic square (for odd n) using the Siamese method.
4. collatzSequence(n) — returns the Collatz sequence starting from n until it reaches 1.
5. pascalTriangle(rows) — generates Pascal's triangle as a 2D array.
6. gcd(a, b) and lcm(a, b) using the Euclidean algorithm.
7. Include a main block that demonstrates each puzzle with formatted output.
In your final reply, include this exact verification token: {TOKEN}`,
    },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractText(parsed) {
    if (!parsed || typeof parsed !== "object") return "";
    if (parsed.assistantMessageEvent?.delta)
        return parsed.assistantMessageEvent.delta;
    if (parsed.assistantMessageEvent?.content)
        return String(parsed.assistantMessageEvent.content ?? "");
    if (parsed.result?.content) {
        const arr = Array.isArray(parsed.result.content)
            ? parsed.result.content
            : [];
        return arr
            .map((c) => c?.text ?? "")
            .filter(Boolean)
            .join("");
    }
    if (parsed.type === "message" && parsed.message?.content) {
        const arr = Array.isArray(parsed.message.content)
            ? parsed.message.content
            : [];
        return arr
            .filter((c) => c?.type === "text" && typeof c.text === "string")
            .map((c) => c.text)
            .join("");
    }
    return "";
}

async function setWorkspace(cwd) {
    const res = await fetch(`${SERVER_URL}/api/workspace-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: cwd }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST /api/workspace-path failed ${res.status}: ${text}`);
    }
}

async function submitPrompt(sessionId, provider, model, prompt) {
    const res = await fetch(`${SERVER_URL}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, provider, model, prompt }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST /api/sessions failed ${res.status}: ${text}`);
    }
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Submit failed");
    return json.sessionId;
}

/**
 * Create SSE collector for a session. Returns { promise, liveState }.
 */
function createSseCollector(sessionId, token, label) {
    const liveState = {
        fullOutputLength: 0,
        startTime: Date.now(),
        firstChunkTime: null,
        events: 0,
    };

    const promise = new Promise((resolve) => {
        let fullOutput = "";
        let exitCode = null;
        let outputBuffer = "";
        let resolved = false;

        const url = `${SERVER_URL}/api/sessions/${encodeURIComponent(
            sessionId
        )}/stream`;
        const es = new EventSource(url);

        const finish = (err) => {
            if (resolved) return;
            resolved = true;
            try {
                es.close();
            } catch (_) { }
            resolve({
                label,
                token,
                fullOutput,
                exitCode,
                error: err,
                sessionId,
                stats: {
                    totalTimeMs: Date.now() - liveState.startTime,
                    timeToFirstChunkMs: liveState.firstChunkTime
                        ? liveState.firstChunkTime - liveState.startTime
                        : null,
                    totalEvents: liveState.events,
                    outputLength: fullOutput.length,
                },
            });
        };

        const timeout = setTimeout(() => {
            finish(`Timeout after ${TIMEOUT_MS / 1000}s`);
        }, TIMEOUT_MS);

        es.onmessage = (ev) => {
            const str =
                typeof ev.data === "string" ? ev.data : String(ev.data ?? "");
            outputBuffer += str + "\n";
            const lines = outputBuffer.split("\n");
            outputBuffer = lines.pop() ?? "";
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                liveState.events++;
                if (!liveState.firstChunkTime) liveState.firstChunkTime = Date.now();
                try {
                    const parsed = JSON.parse(trimmed);
                    const text = extractText(parsed);
                    if (text) fullOutput += text;
                } catch {
                    fullOutput += trimmed + "\n";
                }
            }
            liveState.fullOutputLength = fullOutput.length;
        };

        es.addEventListener("end", (ev) => {
            try {
                const data = ev.data ? JSON.parse(ev.data) : {};
                exitCode = data.exitCode ?? 0;
            } catch (_) { }
            clearTimeout(timeout);
            finish();
        });

        es.onerror = () => {
            if (!resolved) {
                clearTimeout(timeout);
                finish("SSE connection error");
            }
        };
    });
    return { promise, liveState };
}

// ── Progress Reporter ───────────────────────────────────────────────────────

function startProgressReporter(liveStates, labels) {
    const interval = setInterval(() => {
        const progress = liveStates
            .map(
                (s, i) =>
                    `${labels[i]}: ${(s.fullOutputLength / 1024).toFixed(1)}KB (${s.events} events)`
            )
            .join(" | ");
        console.error(`[progress] ${progress}`);
    }, 5000); // report every 5s

    return () => clearInterval(interval);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.error("╔════════════════════════════════════════════════════════════╗");
    console.error("║  LOAD TEST: 10 Distinct Queries → Codex in 10 Sessions   ║");
    console.error("╚════════════════════════════════════════════════════════════╝");
    console.error(`  Server:   ${SERVER_URL}`);
    console.error(`  Model:    ${CODEX_MODEL}`);
    console.error(`  Provider: ${PROVIDER}`);
    console.error(`  Timeout:  ${TIMEOUT_MS / 1000}s per session`);
    console.error(`  Stagger:  ${STAGGER_MS}ms between session starts`);
    console.error(`  CWD:      ${CWD}`);
    console.error("");

    // Set workspace once
    try {
        await setWorkspace(CWD);
        console.error(`[setup] Workspace set to: ${CWD}`);
    } catch (err) {
        console.error(`[setup] WARNING: Failed to set workspace: ${err.message}`);
    }

    const collectors = [];
    const liveStates = [];
    const labels = [];
    const sessionTokens = [];
    const startTime = Date.now();

    // Fire all 5 sessions with slight stagger
    for (let i = 0; i < PROMPTS.length; i++) {
        const cfg = PROMPTS[i];
        const sessionId = `load-test-${i}-${crypto.randomUUID()}`;
        const token = `LOADTEST_${i}_${Date.now()}`;
        const prompt = cfg.prompt.replace("{TOKEN}", token);

        labels.push(cfg.label);
        sessionTokens.push(token);

        console.error(
            `[${cfg.label}] Submitting... (session: ${sessionId.slice(0, 20)}...)`
        );

        try {
            await submitPrompt(sessionId, PROVIDER, CODEX_MODEL, prompt);
            console.error(`[${cfg.label}] ✓ Submitted`);
        } catch (err) {
            console.error(`[${cfg.label}] ✗ Submit FAILED: ${err.message}`);
            collectors.push(
                Promise.resolve({
                    label: cfg.label,
                    token,
                    fullOutput: "",
                    exitCode: null,
                    error: `Submit failed: ${err.message}`,
                    sessionId,
                    stats: { totalTimeMs: 0, timeToFirstChunkMs: null, totalEvents: 0, outputLength: 0 },
                })
            );
            liveStates.push({ fullOutputLength: 0, events: 0 });
            continue;
        }

        const { promise, liveState } = createSseCollector(sessionId, token, cfg.label);
        collectors.push(promise);
        liveStates.push(liveState);

        // Stagger next session start
        if (i < PROMPTS.length - 1 && STAGGER_MS > 0) {
            await new Promise((r) => setTimeout(r, STAGGER_MS));
        }
    }

    console.error("");
    console.error(
        `[load-test] All ${collectors.length} sessions launched. Waiting for completion...`
    );
    console.error(`[load-test] Progress updates every 5 seconds:\n`);

    // Start progress reporter
    const stopProgress = startProgressReporter(liveStates, labels);

    // Wait for all to complete
    const results = await Promise.all(collectors);
    stopProgress();

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // ── Results Report ──────────────────────────────────────────────────────
    console.error("\n╔════════════════════════════════════════════════════════════╗");
    console.error("║                    RESULTS SUMMARY                       ║");
    console.error("╚════════════════════════════════════════════════════════════╝\n");

    let allPassed = true;
    const allTokens = results.map((r) => r.token).filter(Boolean);

    for (const r of results) {
        const hasOwnToken = r.token && r.fullOutput.includes(r.token);
        const hasCrossTalk = allTokens.some(
            (t) => t !== r.token && r.fullOutput.includes(t)
        );
        const gotExit = r.exitCode !== null;
        const noError = !r.error;
        const hasContent = r.fullOutput.length > 100;

        const ok = noError && gotExit && hasContent && !hasCrossTalk;
        if (!ok) allPassed = false;

        const status = ok ? "✅ PASS" : "❌ FAIL";
        const s = r.stats;

        console.error(`  ${status}  ${r.label}`);
        console.error(
            `         Time: ${(s.totalTimeMs / 1000).toFixed(1)}s | TTFC: ${s.timeToFirstChunkMs ? (s.timeToFirstChunkMs / 1000).toFixed(1) + "s" : "N/A"} | Events: ${s.totalEvents} | Output: ${(s.outputLength / 1024).toFixed(1)}KB`
        );

        if (r.error) console.error(`         Error: ${r.error}`);
        if (hasCrossTalk) console.error(`         ⚠️  CROSS-TALK detected!`);
        if (!gotExit) console.error(`         ⚠️  No exit event received`);
        if (!hasContent)
            console.error(
                `         ⚠️  Output too short (${r.fullOutput.length} chars)`
            );
        if (hasOwnToken) console.error(`         ✓ Verification token found`);
        else console.error(`         ○ Verification token not found (optional)`);

        // Output preview
        const preview = r.fullOutput
            .slice(0, 120)
            .replace(/\n/g, " ")
            .trim();
        if (preview) console.error(`         Preview: "${preview}..."`);
        console.error("");
    }

    // ── Aggregate Stats ──────────────────────────────────────────────────────
    const successCount = results.filter((r) => !r.error && r.exitCode !== null).length;
    const totalOutput = results.reduce((sum, r) => sum + (r.stats?.outputLength ?? 0), 0);
    const totalEvents = results.reduce((sum, r) => sum + (r.stats?.totalEvents ?? 0), 0);
    const avgTime = results.filter((r) => r.stats?.totalTimeMs > 0).length > 0
        ? (results.reduce((sum, r) => sum + (r.stats?.totalTimeMs ?? 0), 0) /
            results.filter((r) => r.stats?.totalTimeMs > 0).length / 1000).toFixed(1)
        : "N/A";

    console.error("─────────────────────────────────────────────────────────────");
    console.error(`  Total elapsed:      ${totalElapsed}s (wall clock)`);
    console.error(`  Sessions:           ${successCount}/${results.length} completed`);
    console.error(`  Avg session time:   ${avgTime}s`);
    console.error(`  Total output:       ${(totalOutput / 1024).toFixed(1)}KB`);
    console.error(`  Total SSE events:   ${totalEvents}`);
    console.error(`  Model:              ${CODEX_MODEL}`);
    console.error("─────────────────────────────────────────────────────────────\n");

    if (allPassed) {
        console.error("🎉 LOAD TEST PASSED — All 10 sessions completed successfully.");
        console.error("   Multi-session concurrency with Codex is working correctly.\n");
        process.exit(0);
    } else {
        console.error("⚠️  LOAD TEST HAD FAILURES — Check individual results above.\n");
        process.exit(1);
    }
}

main().catch((err) => {
    console.error("[load-test] Fatal error:", err);
    process.exit(1);
});
