import * as ImagePicker from "expo-image-picker";
import { Linking } from "react-native";
import Toast from "react-native-toast-message";
import { uploadFile } from "@/src/api";

async function ensureCamera(): Promise<boolean> {
  const cur = await ImagePicker.getCameraPermissionsAsync();
  if (cur.granted) return true;
  if (cur.canAskAgain) {
    const req = await ImagePicker.requestCameraPermissionsAsync();
    if (req.granted) return true;
    if (!req.canAskAgain) {
      Toast.show({ type: "error", text1: "يرجى تفعيل إذن الكاميرا من الإعدادات", onPress: () => Linking.openSettings() });
    }
    return false;
  }
  Toast.show({ type: "error", text1: "الكاميرا محظورة، افتح الإعدادات", onPress: () => Linking.openSettings() });
  Linking.openSettings();
  return false;
}

export async function pickImageAndUpload(source: "camera" | "gallery", isPublic = false): Promise<string | null> {
  try {
    let result: ImagePicker.ImagePickerResult;
    if (source === "camera") {
      if (!(await ensureCamera())) return null;
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
    }
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    const name = asset.fileName || `img_${Date.now()}.jpg`;
    const type = asset.mimeType || "image/jpeg";
    const path = await uploadFile(asset.uri, name, type, isPublic);
    return path;
  } catch (e: any) {
    Toast.show({ type: "error", text1: "فشل رفع الصورة", text2: e?.message });
    return null;
  }
}
