declare module "react-native-updater" {
  import { StyleProp, TextStyle, ViewStyle } from "react-native";
  export interface Props {
    appID?: string;
    forceStoreUpdate?: boolean;
    onDidCheck?: (result: Result) => void;
    timeoutProcess?: number;
    codePushDownloadTimeout?: number;
    deploymentKey?: string;
    alertProps?: Partial<{
      title: string;
      titleStyle: StyleProp<TextStyle>;
      message: string;
      modalBackgroundColor: string;
      messageStyle: StyleProp<TextStyle>;
      containerStyle?: StyleProp<ViewStyle>;
      activeButtonStyle: StyleProp<ViewStyle>;
      activeButtonTextStyle: StyleProp<TextStyle>;
      inactiveButtonStyle: StyleProp<ViewStyle>;
      inactiveButtonTextStyle: StyleProp<TextStyle>;
      animationType: "scale" | "slideInUp";
    }>;
  }

  export interface Result {
    storeUrl: string;
    storeVersion: boolean;
    codePushVersion: string;
  }
  export interface StoreResult {
    storeUrl: string;
    hasNewerVersion: boolean;
    currentVersion: string;
    latestVersion: string;
  }

  export interface CodePushResult {
    hasNewerVersion: boolean;
    currentVersion: string;
    latestVersion: string;
  }

  export default class ReactNativeUpdater extends React.Component<Props, {}> {}
}
