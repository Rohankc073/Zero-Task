import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmployeeDashboard } from '../../../src/components/dashboards/EmployeeDashboard';
import { ManagerDashboard } from '../../../src/components/dashboards/ManagerDashboard';
import { DepartmentHeadDashboard } from '../../../src/components/dashboards/DepartmentHeadDashboard';
import { FounderDashboard } from '../../../src/components/dashboards/FounderDashboard';
import { useAuth } from '../../../src/context/AuthContext';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { Colors } from '../../../src/theme/tokens';

export default function DashboardScreen() {
  const { profile, isLoading } = useAuth();
  const userRole = profile?.role;

  const renderDashboard = () => {
    if (isLoading || !profile) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    switch (userRole) {
      case 'Founder':
        return <FounderDashboard />;
      case 'Department Head':
        return <DepartmentHeadDashboard />;
      case 'Manager':
        return <ManagerDashboard />;
      case 'Employee':
      default:
        return <EmployeeDashboard />;
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={['top']}
    >
      <ZeroTaskHeader />
      {renderDashboard()}
    </SafeAreaView>
  );
}
