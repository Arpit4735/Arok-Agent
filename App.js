import React, { useState, useEffect, useRef } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, TextInput, Vibration, Keyboard, ActivityIndicator, Linking, ScrollView, Image, Animated, Modal, SafeAreaView, StatusBar } from 'react-native';
import * as Speech from 'expo-speech';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons, Feather, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Brightness from 'expo-brightness'; // 👇 Brightness Tool Added

// 👇 API KEYS
const API_KEY = "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";
const ELEVENLABS_API_KEY = "sk_812253cd3a478243a7d9676057972661da372e222f16e52e"; 
const VOICE_ID = "TxGEqnHWrfWFTfGW9XjX"; 

// 👇 AVATAR
const IDLE_IMG = "https://img.freepik.com/premium-photo/3d-avatar-boy-character_914455-603.jpg"; 
const TALKING_GIF = "https://cdn.dribbble.com/users/103909/screenshots/2969992/robot-blink.gif";

export default function App() {
  const [inputText, setInputText] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentSound, setCurrentSound] = useState(null);
  
  // States
  const [isListeningMode, setIsListeningMode] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [generatedImage, setGeneratedImage] = useState(null);
  
  const inputRef = useRef(null);

  useEffect(() => {
    setupSystem();
  }, []);

  const setupSystem = async () => {
    if (!permission?.granted) requestPermission();
    // Brightness Permission
    const { status } = await Brightness.requestPermissionsAsync();
    if (status === 'granted') {
        fallbackSpeak("System and Hardware controls active.");
    }
  };

  // --- 🎙️ AUTO-SEND LOGIC ---
  useEffect(() => {
    if (isListeningMode && inputText.length > 0) {
        // Agar 2.5 second tak kuch naya type nahi hua, toh bhejo
        const timer = setTimeout(() => {
            handleSend();
            setIsListeningMode(false); 
        }, 2500);
        return () => clearTimeout(timer);
    }
  }, [inputText, isListeningMode]);

  // --- 🛑 FUNCTIONS ---
  const stopSpeaking = async () => {
    Vibration.vibrate(50);
    setIsSpeaking(false);
    setLoading(false);
    Speech.stop();
    if (currentSound) {
        try { await currentSound.stopAsync(); await currentSound.unloadAsync(); } catch (e) {}
    }
  };

  // --- 🎤 MIC ACTIVATION (FIXED) ---
  const startListening = () => {
      stopSpeaking();
      setIsListeningMode(true);
      Vibration.vibrate(50);
      // Force Keyboard Open
      if (inputRef.current) {
          inputRef.current.focus(); 
      }
  };

  const handleSend = () => {
    const cmd = inputText.toLowerCase().trim();
    if (!cmd) return;
    Keyboard.dismiss();
    stopSpeaking();
    addToHistory('user', cmd);
    processCommand(cmd);
    setInputText(""); 
  };

  const addToHistory = (role, text) => {
    setChatHistory(prev => [{id: Date.now().toString(), role, text}, ...prev]);
  };

  // 🔥 MAIN COMMAND PROCESSOR
  const processCommand = async (cmd) => {
    // 1. BRIGHTNESS CONTROL (FIXED)
    if (cmd.includes('brightness') && (cmd.includes('increase') || cmd.includes('high') || cmd.includes('full'))) {
        await Brightness.setSystemBrightnessAsync(1);
        fallbackSpeak("Brightness maximized.");
        return;
    }
    if (cmd.includes('brightness') && (cmd.includes('decrease') || cmd.includes('low') || cmd.includes('dim'))) {
        await Brightness.setSystemBrightnessAsync(0.2);
        fallbackSpeak("Brightness lowered.");
        return;
    }

    // 2. HARDWARE & APPS
    if (cmd.includes('light on') || cmd.includes('torch on')) { setTorch(true); fallbackSpeak("Flashlight ON"); return; }
    if (cmd.includes('light off') || cmd.includes('torch off')) { setTorch(false); fallbackSpeak("Flashlight OFF"); return; }
    if (cmd.includes('open youtube')) { Linking.openURL('https://www.youtube.com'); fallbackSpeak("Opening YouTube."); return; }
    
    // 3. OWNER
    if (cmd.includes('owner') || cmd.includes('boss')) {
        const reply = "Mr. Arpit Sharma is my creator.";
        addToHistory('ai', reply);
        playElevenLabs(reply);
        return;
    }
    
    // 4. AI BRAIN
    await askAI(cmd);
  };

  const askAI = async (question) => {
    setLoading(true);
    const models = ["meta-llama/llama-3.2-3b-instruct:free", "mistralai/mistral-7b-instruct:free", "google/gemini-2.0-flash-lite-preview-02-05:free"];
    let success = false;

    for (const model of models) {
      if (success) break;
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            "model": model,
            "messages": [
               { "role": "system", "content": "You are JARVIS. Reply concisely in Hinglish or English. Owner: Arpit Sharma." },
               { "role": "user", "content": question }
            ]
          })
        });
        const data = await response.json();
        if (data.choices) {
          const aiText = data.choices[0].message.content;
          addToHistory('ai', aiText);
          playElevenLabs(aiText);
          success = true;
        }
      } catch (e) {}
    }
    
    if (!success) { fallbackSpeak("Server error."); setLoading(false); }
  };

  const playElevenLabs = async (text) => {
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, model_id: "eleven_monolingual_v1" })
      });
      if(!response.ok) throw new Error("Voice Quota");
      const blob = await response.blob();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        setIsSpeaking(true);
        const { sound } = await Audio.Sound.createAsync({ uri: reader.result }, { shouldPlay: true });
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.didJustFinish) setIsSpeaking(false);
        });
        await sound.playAsync();
        setLoading(false);
      };
    } catch (e) { fallbackSpeak(text); }
  };

  const fallbackSpeak = (text) => {
    setIsSpeaking(true);
    setLoading(false);
    Speech.speak(text, { onDone: () => setIsSpeaking(false) });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.topBar}>
        <Feather name="menu" size={24} color="white" />
        <View style={styles.pill}><Text style={styles.pillText}>JARVIS CORE</Text></View>
        <MaterialCommunityIcons name="chip" size={24} color="cyan" />
      </View>

      <ScrollView contentContainerStyle={styles.centerContent}>
        <View style={styles.avatarContainer}>
            {loading ? (
                <ActivityIndicator size="large" color="cyan" />
            ) : (
                <Image 
                    source={{ uri: isSpeaking ? TALKING_GIF : IDLE_IMG }} 
                    style={styles.avatar}
                />
            )}
        </View>

        <Text style={styles.greeting}>{isSpeaking ? "Speaking..." : "Systems Ready"}</Text>

        <View style={styles.chipContainer}>
            <TouchableOpacity style={styles.chip} onPress={() => processCommand("Increase brightness")}>
                <Feather name="sun" size={16} color="yellow" />
                <Text style={styles.chipText}>Brightness Up</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.chip} onPress={() => processCommand("Decrease brightness")}>
                <Feather name="moon" size={16} color="cyan" />
                <Text style={styles.chipText}>Dim</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.chip} onPress={() => Linking.openURL('tel:')}>
                <Feather name="phone" size={16} color="lightgreen" />
                <Text style={styles.chipText}>Call</Text>
            </TouchableOpacity>
        </View>

        {chatHistory.length > 0 && (
            <View style={styles.historyBox}>
                <Text style={{color:'gray', fontSize:10, marginBottom:5}}>LATEST:</Text>
                <Text style={{color:'white', fontWeight:'500'}}>{chatHistory[0]?.text}</Text>
            </View>
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.plusBtn} onPress={() => setTorch(!torch)}>
            <Feather name={torch ? "zap-off" : "zap"} size={24} color="white" />
        </TouchableOpacity>

        <View style={styles.inputContainer}>
            <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={isListeningMode ? "Listening..." : "Message JARVIS"}
                placeholderTextColor="#999"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={handleSend}
            />
            
            {/* 👇 FIXED MIC BUTTON: Opens Keyboard Instantly */}
            <TouchableOpacity 
                onPress={isListeningMode ? handleSend : startListening}
                style={{backgroundColor: isListeningMode ? 'red' : 'transparent', borderRadius: 20, padding: 5}}
            >
                {isListeningMode ? (
                    <Ionicons name="stop" size={24} color="white" />
                ) : (
                    <Ionicons name="mic" size={24} color="white" />
                )}
            </TouchableOpacity>
        </View>
      </View>

      <CameraView style={{width: 1, height: 1, position: 'absolute', opacity: 0}} enableTorch={torch} facing="back" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 40, paddingBottom: 10 },
  pill: { backgroundColor: '#2A2A2A', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  pillText: { color: '#fff', fontWeight: 'bold' },
  centerContent: { alignItems: 'center', justifyContent: 'center', paddingTop: 50 },
  avatarContainer: { width: 220, height: 220, marginBottom: 20, justifyContent:'center', alignItems:'center', borderRadius: 110, overflow: 'hidden', borderWidth: 2, borderColor: '#333' },
  avatar: { width: '100%', height: '100%', resizeMode: 'cover' },
  greeting: { color: 'white', fontSize: 26, fontWeight: 'bold', marginBottom: 30 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E1E', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 20, gap: 8, borderColor: '#333', borderWidth: 1 },
  chipText: { color: 'white', fontSize: 14, fontWeight: '500' },
  historyBox: { marginTop: 30, backgroundColor: '#111', padding: 15, borderRadius: 10, width: '90%', borderColor:'#333', borderWidth:1 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', padding: 15, paddingBottom: 30, gap: 10 },
  plusBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2A2A2A', justifyContent: 'center', alignItems: 'center' },
  inputContainer: { flex: 1, flexDirection: 'row', backgroundColor: '#2A2A2A', borderRadius: 25, paddingHorizontal: 15, alignItems: 'center', height: 50 },
  input: { flex: 1, color: 'white', fontSize: 16 }
});
