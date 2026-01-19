
import { WidgetMetadata, WidgetType } from './types';

export const WIDGETS: WidgetMetadata[] = [
  {
    id: WidgetType.ANALYTICS,
    name: 'Real-time Metrics',
    description: 'Visualized data trends and performance analytics.',
    icon: 'fa-chart-line',
    defaultHeight: '400px',
    defaultWidth: '100%'
  },
  {
    id: WidgetType.SIGNUP,
    name: 'Sign Up Form',
    description: 'User registration form with validation and country selection.',
    icon: 'fa-user-plus',
    defaultHeight: '1200px',
    defaultWidth: '600px'
  }
];
