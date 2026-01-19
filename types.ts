
export enum WidgetType {
  ANALYTICS = 'analytics',
  SIGNUP = 'signup',
}

export interface WidgetMetadata {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultHeight: string;
  defaultWidth: string;
}
