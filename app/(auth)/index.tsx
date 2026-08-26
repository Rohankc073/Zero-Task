import { useRouter } from "expo-router";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../src/components/ui/Button";
import { Colors, Layout, Typography } from "../../src/theme/tokens";

export default function AuthLandingScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* BRANDING GROUP */}
        <Animated.View
          entering={FadeInDown.duration(600).springify()}
          style={styles.brandGroup}
        >
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>ZeroTask</Text>
        </Animated.View>

        {/* ACTION GROUP */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(150).springify()}
          style={styles.actionGroup}
        >
          <Button
            title="Create Account"
            onPress={() => router.push("/(auth)/register")}
            style={styles.primaryButton}
          />

          <TouchableOpacity
            onPress={() => router.push("/(auth)/login")}
            activeOpacity={0.6}
            style={styles.loginContainer}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.loginTextSecondary}>
              Already have an account?{" "}
              <Text style={styles.loginTextPrimary}>Log In</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: Layout.spacing.xxl,
    paddingTop: 80,
    paddingBottom: 40,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  brandGroup: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: Layout.spacing.xl,
  },
  title: {
    fontSize: 38,
    fontFamily: Typography.fontFamily.serif,
    color: Colors.textPrimary,
    marginBottom: Layout.spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textSecondary,
    letterSpacing: 2.5,
    textAlign: "center",
    lineHeight: 18,
  },
  actionGroup: {
    width: "100%",
    alignItems: "center",
  },
  primaryButton: {
    width: "100%",
    marginBottom: Layout.spacing.xl,
    height: 52,
  },
  loginContainer: {
    padding: Layout.spacing.sm,
  },
  loginTextSecondary: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },
  loginTextPrimary: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
});
