import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmployeeDashboard } from '../../../src/components/dashboards/EmployeeDashboard';
import { ManagerDashboard } from '../../../src/components/dashboards/ManagerDashboard';
import { DepartmentHeadDashboard } from '../../../src/components/dashboards/DepartmentHeadDashboard';
import { FounderDashboard } from '../../../src/components/dashboards/FounderDashboard';
import { useAuth } from '../../../src/context/AuthContext';

export default function DashboardScreen() {
  const { profile } = useAuth();
  const userRole = profile?.role;
  
  const renderDashboard = () => {
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f6f2' }}>
      {renderDashboard()}
    </SafeAreaView>
  );
}
