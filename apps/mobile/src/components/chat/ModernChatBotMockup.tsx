import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    FadeInUp,
    Layout,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    ZoomIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';

// --- Types ---
export type Message = {
    id: string;
    text: string;
    isUser: boolean;
    timestamp: Date;
};

// --- Dummy Data ---
const INITIAL_MESSAGES: Message[] = [
    { id: '1', text: 'Hello! I am your modern Chat Bot. How can I assist you today?', isUser: false, timestamp: new Date() },
];

// --- Subview: Message Bubble ---
// Modular extraction of the message bubble for clean architecture.
const MessageBubble = React.memo(({ message }: { message: Message }) => {
    const isUser = message.isUser;

    return (
        <Animated.View
            // iOS Spring Animation for appearing: sliding up & fading in
            entering={FadeInUp.springify().mass(0.8).stiffness(200).damping(18)}
            // Smoothly re-layout when new messages bounce in
            layout={Layout.springify().mass(0.8).stiffness(200).damping(18)}
            style={[
                styles.messageWrapper,
                isUser ? styles.messageWrapperUser : styles.messageWrapperBot,
            ]}
        >
            <View
                style={[
                    styles.messageBubble,
                    isUser ? styles.messageBubbleUser : styles.messageBubbleBot,
                ]}
            >
                <Text style={[styles.messageText, isUser ? styles.messageTextUser : styles.messageTextBot]}>
                    {message.text}
                </Text>
            </View>
        </Animated.View>
    );
});

// --- Subview: Tactile Send Button ---
const SendButton = ({ onPress, disabled }: { onPress: () => void; disabled: boolean }) => {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
            opacity: disabled ? withTiming(0.5) : withTiming(1),
        };
    });

    const handlePressIn = () => {
        if (disabled) return;
        // Subtle scale down effect
        scale.value = withSpring(0.92, { damping: 10, stiffness: 300 });
    };

    const handlePressOut = () => {
        if (disabled) return;
        // Spring back to normal
        scale.value = withSpring(1, { damping: 10, stiffness: 300 });
    };

    const handlePress = () => {
        if (disabled) return;
        // Light haptic feedback on successful press
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
    };

    return (
        <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
            disabled={disabled}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
            <Animated.View style={[styles.sendButton, animatedStyle]}>
                <Animated.Text entering={ZoomIn} style={styles.sendButtonText}>
                    Send
                </Animated.Text>
            </Animated.View>
        </Pressable>
    );
};

// --- Main Chat Page ---
export default function ModernChatBotPage() {
    const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
    const [inputText, setInputText] = useState('');
    const flatListRef = useRef<FlatList>(null);
    const insets = useSafeAreaInsets();

    const handleSend = useCallback(() => {
        const trimmed = inputText.trim();
        if (!trimmed) return;

        const newMessage: Message = {
            id: Date.now().toString(),
            text: trimmed,
            isUser: true,
            timestamp: new Date(),
        };

        // Chat uses an inverted list, so we prepend the new message
        setMessages((prev) => [newMessage, ...prev]);
        setInputText('');

        // Simulate bot response after a brief delay
        setTimeout(() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const botMessage: Message = {
                id: (Date.now() + 1).toString(),
                text: "I received your message! Smooth animations are looking great.",
                isUser: false,
                timestamp: new Date(),
            };
            setMessages((prev) => [botMessage, ...prev]);
        }, 1200);
    }, [inputText]);

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                {/* Messages List */}
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => <MessageBubble message={item} />}
                    showsVerticalScrollIndicator={false}
                    // Inverted provides standard chat scrolling behavior (bottom-up)
                    inverted
                    // Add bottom padding to prevent the last message from hiding under the input dock
                    contentContainerStyle={[styles.listContent, { paddingTop: 20, paddingBottom: insets.bottom + 90 }]}
                />

                {/* Sticky Input Dock with iOS Blur Effect */}
                <BlurView
                    intensity={85}
                    tint="light"
                    style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}
                >
                    <View style={styles.inputWrapper}>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Message..."
                            placeholderTextColor="#8E8E93"
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                            maxLength={1000}
                        />
                        <SendButton onPress={handleSend} disabled={inputText.trim().length === 0} />
                    </View>
                </BlurView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// --- Styles ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F2F2F7', // iOS Standard System Grouped Background 
    },
    keyboardView: {
        flex: 1,
    },
    listContent: {
        paddingHorizontal: 16,
    },
    messageWrapper: {
        marginVertical: 6,
        maxWidth: '85%',
    },
    messageWrapperUser: {
        alignSelf: 'flex-end',
    },
    messageWrapperBot: {
        alignSelf: 'flex-start',
    },
    messageBubble: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 22,
        overflow: 'hidden',
    },
    messageBubbleUser: {
        backgroundColor: '#007AFF', // iOS Blue
        borderBottomRightRadius: 6,
    },
    messageBubbleBot: {
        backgroundColor: '#FFFFFF', // Clean white for bot
        borderBottomLeftRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#E5E5EA',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    messageText: {
        fontSize: 16,
        lineHeight: 22,
    },
    messageTextUser: {
        color: '#FFFFFF',
    },
    messageTextBot: {
        color: '#000000',
    },
    inputContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: '#C6C6C8',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#C6C6C8',
    },
    textInput: {
        flex: 1,
        maxHeight: 120,
        minHeight: 24,
        fontSize: 16,
        lineHeight: 20,
        paddingTop: 4,
        paddingBottom: 4,
        color: '#000000',
    },
    sendButton: {
        marginLeft: 12,
        backgroundColor: '#007AFF',
        borderRadius: 18,
        paddingVertical: 8,
        paddingHorizontal: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: -2, // Aligns perfectly when input grows
    },
    sendButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
    },
});
