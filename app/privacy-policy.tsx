import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const privacyPolicyData = [
  {
    id: "about",
    heading: "1. About ZeroTask",
    body: "ZeroTask is a proprietary operational and project management platform utilized by our organization. This Privacy Policy explains what information the application collects and how it is used internally. ZeroTask is an internal execution system, not a public-facing service.",
  },
  {
    id: "info-store",
    heading: "2. Information We Store",
    body: "To provide access to ZeroTask, we store basic account information. This includes your email address, your display name, your assigned role (Founder, Department Head, Manager, or Employee), and your department association. We also store the operational data you generate while using the application.",
  },
  {
    id: "info-use",
    heading: "3. How We Use Information",
    body: "We use your account information strictly to provide access to ZeroTask and to accurately associate your work, comments, and uploads with your identity. Your role and department dictate what data you are authorized to see and interact with.",
  },
  {
    id: "work-data",
    heading: "4. Tasks, Assignments and Work Data",
    body: "ZeroTask records all task data, including titles, descriptions, due dates, priorities, and statuses. We track task assignments and reassignments to provide clear execution visibility. This operational data is visible to your managers, department heads, and founders.",
  },
  {
    id: "chat",
    heading: "5. Chat and Communication",
    body: "The application stores messages sent in the General Chat and Department Chat channels to facilitate team communication. These messages are visible to other authorized members of the respective chat channels.",
  },
  {
    id: "files",
    heading: "6. File Attachments",
    body: "Files attached to tasks are securely stored so that authorized team members can access them. You maintain deletion rights over the files you upload, and Founders possess administrative override rights to delete any attachment if necessary.",
  },
  {
    id: "alerts",
    heading: "7. Notifications and Alerts",
    body: "We store records of in-app alerts and notifications, such as task assignments or pending approvals, to ensure you are informed of actionable events. This allows the Focus Mode and dashboard to accurately reflect what needs your attention.",
  },
  {
    id: "permissions",
    heading: "8. Access and Permissions",
    body: "Your access to information depends on your role. The application enforces strict organizational hierarchy rules. For example, Department Heads can view all departmental activity, while Managers only see data relevant to their specific teams. This is enforced at the database level.",
  },
  {
    id: "storage",
    heading: "9. Data Storage and Security",
    body: "Your data is stored securely using Supabase cloud infrastructure. Access to data is governed by Row Level Security (RLS) policies within the database, ensuring that information cannot be accessed outside of the application's authorized role boundaries.",
  },
  {
    id: "third-party",
    heading: "10. Third-Party Services",
    body: "ZeroTask utilizes Supabase for database storage and authentication. [REQUIRES COMPANY CONFIRMATION: Specific third-party data processors and compliance terms.]",
  },
  {
    id: "retention",
    heading: "11. Data Retention",
    body: "Operational data-such as tasks, messages, and attachments-is retained indefinitely to preserve project history and business continuity, unless manually deleted by an authorized user. If your employment ends, your account access will be revoked, but your past work data will remain in the system.",
  },
  {
    id: "choices",
    heading: "12. Your Choices and Account Access",
    body: "You can update your display name and change your password from the Profile tab. Because ZeroTask is an internal company tool, requests to completely erase your operational data or account must be directed to your administration.",
  },
  {
    id: "changes",
    heading: "13. Changes to This Privacy Policy",
    body: "We may update this internal Privacy Policy as ZeroTask evolves and new features are added. Significant changes to data handling practices will be communicated internally.",
  },
  {
    id: "contact",
    heading: "14. Contact Information",
    body: "If you have any questions about how your data is handled within ZeroTask, please contact our administration. [REQUIRES COMPANY CONFIRMATION: Insert specific internal contact email or department here.]",
  },
];

export default function PrivacyPolicy() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: "Privacy Policy",
          headerStyle: { backgroundColor: "#f7f6f2" },
          headerTintColor: "#0f141a",
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginLeft: 16 }}
            >
              <Ionicons name="arrow-back" size={24} color="#0f141a" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.documentHeader}>
          Internal Privacy & Data Governance
        </Text>
        <Text style={styles.effectiveDate}>Effective Date: July 30, 2026</Text>

        {privacyPolicyData.map((item) => (
          <View key={item.id} style={styles.sectionContainer}>
            <Text style={styles.heading}>{item.heading}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        ))}

        <View style={styles.endMarkerContainer}>
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f6f2",
  },
  container: {
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  documentHeader: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f141a",
    marginBottom: 4,
  },
  effectiveDate: {
    fontSize: 14,
    fontStyle: "italic",
    color: "rgba(15, 20, 26, 0.6)",
    marginBottom: 32,
  },
  sectionContainer: {
    marginBottom: 28,
  },
  heading: {
    fontSize: 18,
    fontWeight: "600",
    color: "#0f141a",
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: "rgba(15, 20, 26, 0.85)",
    textAlign: "left",
  },
  endMarkerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 32,
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#e1c37a",
  },
});
