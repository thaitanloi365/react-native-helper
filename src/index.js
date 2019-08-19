import React from "react";
import {
  Linking,
  TouchableOpacity,
  StyleSheet,
  View,
  Text,
  AppState,
  Modal,
  Animated,
  Dimensions,
  Easing
} from "react-native";
import CodePush from "react-native-code-push";
import VersionCheck from "react-native-version-check";

/**
 * @extends {React.Component<import("react-native-updater").Props>}
 */

class ReactNativeUpdater extends React.Component {
  _TAG = "**** React Native Helper ->";
  _timeoutHanlder = null;
  _timeoutProcessHanlder = null;
  _storeUrl = null;
  _calledCheckDone = false;
  _downloaded = false;
  _appOnResumeCount = 0;

  _packgeInfo = {
    storeUrl: null,
    storeVersion: null,
    codePushVersion: null
  };

  state = {
    isVisible: false,
    installLater: false,
    showContent: true,
    animatedOpacityValue: new Animated.Value(0),
    animatedTranslateValue: new Animated.Value(0),
    animationType: "slideInUp"
  };

  static defaultProps = {
    checkOnResume: true,
    timeoutProcess: 60000,
    codePushDownloadTimeout: 30000,
    alertProps: {
      title: "New app version is available.",
      message: "Please upgrade your app to latest version.",
      modalBackgroundColor: "rgba(0,0,0,0.7)",
      animationType: "slide"
    }
  };

  componentDidMount() {
    this._handleAppStateChange("active");

    if (this.props.checkOnResume) {
      AppState.addEventListener("change", this._handleAppStateChange);
    }
  }

  componentWillUnmount() {
    AppState.removeEventListener("change", this._handleAppStateChange);
    this._timeoutHanlder && clearTimeout(this._timeoutHanlder);
    this._timeoutProcessHanlder && clearTimeout(this._timeoutProcessHanlder);
  }

  _triggerDidCheck = () => {
    if (this._calledCheckDone == false) {
      if (!this._downloaded) return;

      console.log(this._TAG, "onDidCheck:", this._packgeInfo);
      this._calledCheckDone = true;
      this._downloaded = false;

      const { onDidCheck } = this.props;
      onDidCheck && onDidCheck(this._packgeInfo);
      if (this._packgeInfo && typeof this._packgeInfo.storeUrl === "string" && this._packgeInfo.storeUrl !== "") {
        this._storeUrl = this._packgeInfo.storeUrl;
        this.setState({ isVisible: true }, this._showAlert);
      }
    } else {
      if (this._appOnResumeCount && this.state.installLater === false) {
        const { onDidCheck } = this.props;
        onDidCheck && onDidCheck(this._packgeInfo);
        if (this._packgeInfo && typeof this._packgeInfo.storeUrl === "string" && this._packgeInfo.storeUrl !== "") {
          this._storeUrl = this._packgeInfo.storeUrl;
          this.setState({ isVisible: true }, this._showAlert);
        }
      }
    }
  };

  _handleAppStateChange = nextAppState => {
    const { installLater } = this.state;
    if (nextAppState === "active" && installLater === false) {
      this._checkStore()
        .then(response => {
          this._packgeInfo.storeUrl = response.storeUrl;
          this._packgeInfo.storeVersion = response.currentVersion || response.latestVersion;

          console.log(this._TAG, "check store done:", response);
          if (response.hasNewerVersion) {
            throw Error("Need update store, check done.");
          }
          return true;
        })
        .then(shouldCheckCodePush => {
          if (shouldCheckCodePush && this._appOnResumeCount === 0) {
            this._appOnResumeCount += 1;
            return this._checkCodePush();
          }
          return null;
        })
        .then(response => {
          if (!response) {
            throw Error("No need update code push, check done.");
          }
          if (!response.hasNewerVersion) {
            throw Error("No have newer code push version.");
          }
          console.log(this._TAG, "Start code push updating....", response);
          this._packgeInfo.codePushVersion = response.currentVersion || response.latestVersion;
          return;
        })
        .catch(error => {
          console.log(this._TAG, "check error:", error);
          this._triggerDidCheck();
        });
    }
  };

  /**
   * @return {Promise<import("react-native-updater").CodePushResult>}
   */
  _checkCodePush = () => {
    return new Promise((resolve, reject) => {
      const { deploymentKey } = this.props;
      if (typeof deploymentKey !== "string" || deploymentKey === "") {
        reject("Deployment key invalid.");
        return;
      }

      console.log(this._TAG, "checking code push...");

      CodePush.checkForUpdate(deploymentKey)
        .then(remotePackage => {
          console.log(this._TAG, "remotePackage:", remotePackage);

          if (!remotePackage) {
            CodePush.getUpdateMetadata(CodePush.UpdateState.LATEST)
              .then(response => {
                if (!response) throw Error("Fail to fetch code push metadata.");

                const buildNumber = response.label.substring(1);
                const version = `${response.appVersion}.${buildNumber}`;
                this._packgeInfo.codePushVersion = version;
                throw Error("App is up to date.");
              })
              .catch(error => reject(error));
            return;
          }
          const codePushOptions = {
            installMode: CodePush.InstallMode.ON_NEXT_RESTART,
            mandatoryInstallMode: CodePush.InstallMode.ON_NEXT_RESTART,
            deploymentKey: deploymentKey
          };

          CodePush.sync(codePushOptions, this._codePushStatusDidChange, this._codePushDownloadDidProgress);

          const buildNumber = remotePackage.label.substring(1);
          const version = `${remotePackage.appVersion}.${buildNumber}`;
          this._packgeInfo.codePushVersion = version;

          const result = {
            hasNewerVersion: true,
            currentVersion: version,
            latestVersion: version
          };
          resolve(result);
        })
        .catch(error => {
          console.log(this._TAG, "check code push error:", error);
        });
    });
  };

  /**
   * @return {Promise<import('react-native-updater').StoreResult>}
   */

  _checkStore = () => {
    return new Promise((resolve, reject) => {
      const { appID } = this.props;
      console.log(this._TAG, "Check store with appID:", appID);

      let result = {
        hasNewerVersion: false,
        currentVersion: null,
        latestVersion: null,
        storeUrl: null
      };
      if (typeof appID !== "string" || appID === "") {
        Promise.all([VersionCheck.getCurrentVersion(), VersionCheck.getCurrentBuildNumber()]).then(values => {
          result.currentVersion = `${values[0]}.${values[1]}`;
        });

        resolve(result);
        return;
      }

      VersionCheck.needUpdate()
        .then(res => {
          console.log(this._TAG, "store info:", res);
          result.hasNewerVersion = res.isNeeded;
          result.currentVersion = res.currentVersion;
          result.latestVersion = res.latestVersion;
          return res.isNeeded;
        })
        .then(isNeededUpdateAppStore => {
          console.log(this._TAG, "Store info:", result);

          if (!isNeededUpdateAppStore) {
            resolve(result);
            return;
          }

          return VersionCheck.getStoreUrl({ appID });
        })
        .then(storeUrl => {
          console.log(this._TAG, "storeUrl:", storeUrl);
          if (!storeUrl) throw Error("store url invalid: ");
          result.storeUrl = storeUrl;
          this._storeUrl = storeUrl;
          return Linking.canOpenURL(storeUrl);
        })
        .then(canOpenStoreURL => {
          if (!canOpenStoreURL) throw Error("Can't open store url.");
          resolve(result);
        })
        .catch(error => {
          console.log(this._TAG, "check store error:", error);
          reject(error);
        });
    });
  };

  _codePushStatusDidChange = syncStatus => {
    let syncMessage = "";
    switch (syncStatus) {
      case CodePush.SyncStatus.CHECKING_FOR_UPDATE:
        syncMessage = "Checking update.";
        break;
      case CodePush.SyncStatus.DOWNLOADING_PACKAGE:
        this._downloaded = false;
        this._timeoutHanlder = setTimeout(this._triggerDidCheck, this.props.codePushDownloadTimeout);
        syncMessage = "Downloading update.";
        break;
      case CodePush.SyncStatus.AWAITING_USER_ACTION:
        syncMessage = "Awating user action.";
        break;
      case CodePush.SyncStatus.INSTALLING_UPDATE:
        syncMessage = "Installing update.";
        this._downloaded = true;
        break;
      case CodePush.SyncStatus.UP_TO_DATE:
        this._triggerDidCheck();
        syncMessage = "App up to date.";
        break;
      case CodePush.SyncStatus.UPDATE_IGNORED:
        syncMessage = "Update is ignored";
        break;
      case CodePush.SyncStatus.UPDATE_INSTALLED:
        syncMessage = "Update is installed";
        CodePush.restartApp();
        break;
      case CodePush.SyncStatus.UNKNOWN_ERROR:
        syncMessage = "Unknown error.";
        this._triggerDidCheck();
        break;
    }
    console.log(this._TAG, "status did change: ", syncMessage);
  };

  _codePushDownloadDidProgress = progress => {
    const { receivedBytes, totalBytes } = progress;
    const percent = receivedBytes / totalBytes;
    console.log(this._TAG, "downloading package:", Math.round(percent * 100), "%");
  };

  _getAnimation = () => {
    const { animatedTranslateValue, animatedOpacityValue } = this.state;
    const { alertProps } = this.props;
    if (alertProps && alertProps.animationType === "scale") {
      const scale = animatedTranslateValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1]
      });

      const opacity = animatedTranslateValue.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0.7, 1],
        extrapolate: "clamp"
      });

      const scaleStyle = {
        transform: [{ scale }],
        opacity
      };

      return scaleStyle;
    }

    const { height } = Dimensions.get("window");
    const translateY = animatedTranslateValue.interpolate({
      inputRange: [0, 0.5, 0.7, 0.9, 1],
      outputRange: [height, height / 4, height / 6, height / 8, 0],
      extrapolate: "clamp"
    });
    const opacity = animatedTranslateValue.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0.7, 1],
      extrapolate: "clamp"
    });
    const slideAnimationStyle = {
      opacity,
      transform: [{ translateY }]
    };

    const opacityStyle = {
      opacity: animatedOpacityValue.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0.7, 1],
        extrapolate: "clamp"
      })
    };

    return { slideAnimationStyle, opacityStyle };
  };

  _showAlert = () => {
    const { animatedOpacityValue, animatedTranslateValue } = this.state;
    Animated.sequence([
      Animated.timing(animatedOpacityValue, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true
      }),
      Animated.timing(animatedTranslateValue, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true
      })
    ]).start();
  };

  _hideAlert = () => {
    const { animatedOpacityValue, animatedTranslateValue } = this.state;
    Animated.sequence([
      Animated.timing(animatedTranslateValue, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true
      }),
      Animated.timing(animatedOpacityValue, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true
      })
    ]).start(() => this.setState({ showContent: false }, () => this.setState({ isVisible: false })));
  };

  _renderModal = () => {
    const { alertProps } = this.props;
    const {
      title,
      titleStyle,
      message,
      messageStyle,
      activeButtonStyle,
      activeButtonTextStyle,
      inactiveButtonStyle,
      inactiveButtonTextStyle,
      containerStyle,
      modalBackgroundColor
    } = alertProps;
    const { showContent, isVisible } = this.state;

    const backgroundColor = showContent ? modalBackgroundColor : "transparent";

    const { slideAnimationStyle, opacityStyle } = this._getAnimation();
    return (
      <Modal transparent visible={isVisible}>
        <Animated.View style={[styles.modal, { backgroundColor }, opacityStyle]}>
          {showContent && (
            <Animated.View style={[styles.container, containerStyle, slideAnimationStyle]}>
              {typeof title === "string" && title !== "" && <Text style={[styles.title, titleStyle]}>{title}</Text>}
              {typeof message === "string" && message !== "" && (
                <Text style={[styles.message, messageStyle]}>{message}</Text>
              )}
              <View style={styles.rowButton}>
                <TouchableOpacity
                  style={[styles.outlineButton, inactiveButtonStyle]}
                  activeOpacity={0.7}
                  onPress={() => this.setState({ installLater: true }, this._hideAlert)}
                >
                  <Text style={[styles.outlineButtonText, inactiveButtonTextStyle]}>Later</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.solidButton, activeButtonStyle]}
                  activeOpacity={0.7}
                  onPress={() => Linking.openURL(this._storeUrl)}
                >
                  <Text style={[styles.solidButtonText, activeButtonTextStyle]}>Update now</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
        </Animated.View>
      </Modal>
    );
  };

  render() {
    return this._renderModal();
  }
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    backgroundColor: "white",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16
  },
  modal: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    fontSize: 20,
    color: "black",
    fontWeight: "700",
    marginBottom: 15,
    textAlign: "center"
  },
  message: {
    fontSize: 16,
    color: "black",
    fontWeight: "400",
    marginBottom: 30
  },
  solidButton: {
    flex: 1,
    marginLeft: 8,
    borderRadius: 6,
    backgroundColor: "#F06182",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#F06182",
    justifyContent: "center",
    alignItems: "center"
  },
  solidButtonText: {
    fontSize: 16,
    color: "white",
    fontWeight: "700"
  },
  outlineButton: {
    flex: 1,
    marginRight: 8,
    borderRadius: 6,
    backgroundColor: "white",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#F06182",
    justifyContent: "center",
    alignItems: "center"
  },
  outlineButtonText: {
    fontSize: 16,
    color: "#F06182",
    fontWeight: "700"
  },
  rowButton: {
    flexDirection: "row",
    justifyContent: "space-between"
  }
});

const codePushOptions = {
  checkFrequency: CodePush.CheckFrequency.MANUAL,
  updateDialog: null
};
export default CodePush(codePushOptions)(ReactNativeUpdater);
