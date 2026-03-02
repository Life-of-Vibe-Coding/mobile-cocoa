/**
 * SwipeablePageNavigator
 *
 * An iOS-native-style horizontal page navigator that allows:
 * - Swiping LEFT on the main page to reveal an overlay page (push)
 * - Swiping RIGHT on the overlay page to dismiss it (pop)
 * - Programmatic open/close via `isOpen` prop
 *
 * The overlay page slides in from the right edge, matching iOS
 * UINavigationController push/pop transitions with an interactive
 * back-swipe gesture.
 */
import React, { useCallback, useEffect } from "react";
import { Dimensions, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    Easing,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";

const SCREEN_WIDTH = Dimensions.get("window").width;
// Minimum swipe distance to trigger navigation
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
// Velocity that also triggers navigation (px/s)
const VELOCITY_THRESHOLD = 500;
// iOS-like spring timing config
const TIMING_CONFIG = {
    duration: 320,
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};

type SwipeablePageNavigatorProps = {
    /** Whether the overlay page is currently open */
    isOpen: boolean;
    /** Called when a swipe gesture requests to open the overlay */
    onOpen: () => void;
    /** Called when a swipe gesture requests to close the overlay */
    onClose: () => void;
    /** The main (background) page content */
    mainPage: React.ReactNode;
    /** The overlay page content that slides in from the right */
    overlayPage: React.ReactNode;
    /** Whether swipe-to-open gesture is enabled on the main page (default: true) */
    swipeToOpenEnabled?: boolean;
    /** Edge width for the swipe-to-open gesture area. 0 = full screen (default: 0) */
    edgeWidth?: number;
};

export function SwipeablePageNavigator({
    isOpen,
    onOpen,
    onClose,
    mainPage,
    overlayPage,
    swipeToOpenEnabled = true,
    edgeWidth = 0,
}: SwipeablePageNavigatorProps) {
    // 0 = closed (overlay offscreen right), 1 = open (overlay fully visible)
    const progress = useSharedValue(isOpen ? 1 : 0);
    const isGestureActive = useSharedValue(false);

    // Sync with programmatic open/close
    useEffect(() => {
        if (!isGestureActive.value) {
            progress.value = withTiming(isOpen ? 1 : 0, TIMING_CONFIG);
        }
    }, [isOpen]);

    const handleOpen = useCallback(() => {
        onOpen();
    }, [onOpen]);

    const handleClose = useCallback(() => {
        onClose();
    }, [onClose]);

    // ── Swipe-to-open gesture on the main page (swipe LEFT) ──
    const openGesture = Gesture.Pan()
        .enabled(swipeToOpenEnabled && !isOpen)
        .activeOffsetX([-15, 15])
        .failOffsetY([-10, 10])
        .onStart(() => {
            isGestureActive.value = true;
        })
        .onUpdate((event) => {
            // Negative translationX = swiping left = opening
            const rawProgress = -event.translationX / SCREEN_WIDTH;
            progress.value = Math.max(0, Math.min(1, rawProgress));
        })
        .onEnd((event) => {
            isGestureActive.value = false;
            const distance = -event.translationX;
            const velocity = -event.velocityX;

            if (distance > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
                progress.value = withTiming(1, TIMING_CONFIG);
                runOnJS(handleOpen)();
            } else {
                progress.value = withTiming(0, TIMING_CONFIG);
            }
        });

    // ── Swipe-to-close gesture on the overlay page (swipe RIGHT) ──
    const closeGesture = Gesture.Pan()
        .enabled(isOpen)
        .activeOffsetX([-15, 15])
        .failOffsetY([-10, 10])
        .onStart(() => {
            isGestureActive.value = true;
        })
        .onUpdate((event) => {
            // Positive translationX = swiping right = closing
            const rawProgress = 1 - event.translationX / SCREEN_WIDTH;
            progress.value = Math.max(0, Math.min(1, rawProgress));
        })
        .onEnd((event) => {
            isGestureActive.value = false;
            const distance = event.translationX;
            const velocity = event.velocityX;

            if (distance > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
                progress.value = withTiming(0, TIMING_CONFIG);
                runOnJS(handleClose)();
            } else {
                progress.value = withTiming(1, TIMING_CONFIG);
            }
        });

    // ── Animated styles ──

    // Main page: slight parallax shift to the left when overlay opens (iOS-style)
    const mainPageStyle = useAnimatedStyle(() => {
        const translateX = interpolate(progress.value, [0, 1], [0, -SCREEN_WIDTH * 0.3]);
        const scale = interpolate(progress.value, [0, 1], [1, 0.94]);
        const borderRadius = interpolate(progress.value, [0, 1], [0, 12]);
        return {
            transform: [{ translateX }, { scale }],
            borderRadius,
            overflow: "hidden" as const,
        };
    });

    // Overlay page: slides in from the right edge
    const overlayPageStyle = useAnimatedStyle(() => {
        const translateX = interpolate(progress.value, [0, 1], [SCREEN_WIDTH, 0]);
        return {
            transform: [{ translateX }],
        };
    });

    // Shadow overlay on main page as overlay slides in
    const shadowOverlayStyle = useAnimatedStyle(() => {
        const opacity = interpolate(progress.value, [0, 1], [0, 0.35]);
        return { opacity };
    });

    return (
        <Animated.View style={styles.container}>
            {/* Main page with parallax + open gesture */}
            <GestureDetector gesture={openGesture}>
                <Animated.View style={[styles.page, mainPageStyle]}>
                    {mainPage}
                    {/* Shadow overlay on top of main page */}
                    <Animated.View
                        style={[styles.shadowOverlay, shadowOverlayStyle]}
                        pointerEvents="none"
                    />
                </Animated.View>
            </GestureDetector>

            {/* Overlay page with close gesture */}
            <GestureDetector gesture={closeGesture}>
                <Animated.View style={[styles.overlayPage, overlayPageStyle]}>
                    {overlayPage}
                </Animated.View>
            </GestureDetector>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000",
    },
    page: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "transparent",
    },
    shadowOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "#000",
    },
    overlayPage: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "transparent",
    },
});
