/* @flow */

import * as React from 'react';
import PropTypes from 'prop-types';
import {
  Animated,
  StyleSheet,
  View,
  ScrollView,
  Platform,
  I18nManager,
} from 'react-native';
import TouchableItem from './TouchableItem';
import { SceneRendererPropType } from './TabViewPropTypes';
import type {
  Scene,
  SceneRendererProps,
  Route,
  Style,
} from './TabViewTypeDefinitions';

type IndicatorProps<T> = SceneRendererProps<T> & {
  width: number,
};

type ScrollEvent = {
  nativeEvent: {
    contentOffset: {
      x: number,
    },
  },
};

type Props<T> = SceneRendererProps<T> & {
  scrollEnabled?: boolean,
  pressColor?: string,
  pressOpacity?: number,
  getLabelText: (scene: Scene<T>) => ?string,
  renderLabel?: (scene: Scene<T>) => ?React.Element<any>,
  renderIcon?: (scene: Scene<T>) => ?React.Element<any>,
  renderBadge?: (scene: Scene<T>) => ?React.Element<any>,
  renderIndicator?: (props: IndicatorProps<T>) => ?React.Element<any>,
  onTabPress?: (scene: Scene<T>) => void,
  tabStyle?: Style,
  indicatorStyle?: Style,
  labelStyle?: Style,
  focusedtabStyle?: Style,
  style?: Style,
};

type State = {|
  offset: Animated.Value,
  visibility: Animated.Value,
  initialOffset: {| x: number, y: number |},
|};

export default class TabBar<T: Route<*>> extends React.PureComponent<
  Props<T>,
  State
> {
  static propTypes = {
    ...SceneRendererPropType,
    scrollEnabled: PropTypes.bool,
    pressColor: TouchableItem.propTypes.pressColor,
    pressOpacity: TouchableItem.propTypes.pressOpacity,
    getLabelText: PropTypes.func,
    renderIcon: PropTypes.func,
    renderLabel: PropTypes.func,
    renderIndicator: PropTypes.func,
    onTabPress: PropTypes.func,
    labelStyle: PropTypes.any,
    focusedtabStyle: PropTypes.any,
    style: PropTypes.any,
  };

  static defaultProps = {
    getLabelText: ({ route }) =>
      route.title ? route.title.toUpperCase() : null,
  };

  constructor(props: Props<T>) {
    super(props);

    let initialVisibility = 1;

    if (this.props.scrollEnabled) {
      const tabWidth = this._getTabWidth(this.props);
      if (!tabWidth) {
        initialVisibility = 0;
      }
    }

    this.state = {
      offset: new Animated.Value(0),
      visibility: new Animated.Value(initialVisibility),
      initialOffset: {
        x: this._getScrollAmount(this.props, this.props.navigationState.index),
        y: 0,
      },
    };
  }

  componentDidMount() {
    this._adjustScroll(this.props.navigationState.index);
    this._positionListener = this.props.subscribe(
      'position',
      this._adjustScroll
    );
  }

  componentDidUpdate(prevProps: Props<T>) {
    const prevTabWidth = this._getTabWidth(prevProps);
    const currentTabWidth = this._getTabWidth(this.props);

    if (prevTabWidth !== currentTabWidth && currentTabWidth) {
      this.state.visibility.setValue(1);
    }

    if (this.props.scrollEnabled) {
      if (prevProps.navigationState !== this.props.navigationState) {
        this._resetScrollOffset(this.props);
      } else if (
        prevProps.layout !== this.props.layout ||
        prevTabWidth !== currentTabWidth
      ) {
        this._adjustScroll(this.props.navigationState.index);
      }
    }
  }

  componentWillUnmount() {
    this._positionListener.remove();
  }

  _positionListener: Object;
  _scrollView: ?ScrollView;
  _isManualScroll: boolean = false;
  _isMomentumScroll: boolean = false;
  _scrollOffset: number = 0;

  _renderLabel = (scene: Scene<*>) => {
    if (typeof this.props.renderLabel !== 'undefined') {
      return this.props.renderLabel(scene);
    }
    const label = this.props.getLabelText(scene);
    if (typeof label !== 'string') {
      return null;
    }
    return (
      <Animated.Text style={[styles.tabLabel, this.props.labelStyle]}>
        {label}
      </Animated.Text>
    );
  };

  _renderIndicator = (props: IndicatorProps<T>) => {
    if (typeof this.props.renderIndicator !== 'undefined') {
      return this.props.renderIndicator(props);
    }
    const { width, position, navigationState } = props;
    const translateX = Animated.multiply(
      Animated.multiply(
        position.interpolate({
          inputRange: [0, navigationState.routes.length - 1],
          outputRange: [0, navigationState.routes.length - 1],
          extrapolate: 'clamp',
        }),
        width
      ),
      I18nManager.isRTL ? -1 : 1
    );
    return (
      <Animated.View
        style={[
          styles.indicator,
          { width, transform: [{ translateX }] },
          this.props.indicatorStyle,
        ]}
      />
    );
  };

  _getTabWidth = (props: Props<T>) => {
    const { layout, navigationState, tabStyle } = props;
    const flattened = StyleSheet.flatten(tabStyle);

    if (flattened) {
      switch (typeof flattened.width) {
        case 'number':
          return flattened.width;
        case 'string':
          if (flattened.width.endsWith('%')) {
            const width = parseFloat(flattened.width);
            if (Number.isFinite(width)) {
              return layout.width * (width / 100);
            }
          }
      }
    }

    if (props.scrollEnabled) {
      return layout.width / 5 * 2;
    }

    return layout.width / navigationState.routes.length;
  };

  _getMaxScrollableDistance = (props: Props<T>) => {
    const { layout, navigationState } = props;
    if (layout.width === 0) {
      return 0;
    }
    const tabWidth = this._getTabWidth(props);
    const tabBarWidth = tabWidth * navigationState.routes.length;
    const maxDistance = tabBarWidth - layout.width;
    return Math.max(maxDistance, 0);
  };

  _normalizeScrollValue = (props: Props<T>, value: number) => {
    const maxDistance = this._getMaxScrollableDistance(props);
    return Math.max(Math.min(value, maxDistance), 0);
  };

  _getScrollAmount = (props: Props<T>, i: number) => {
    const { layout } = props;
    const tabWidth = this._getTabWidth(props);
    const centerDistance = tabWidth * (i + 1 / 2);
    const scrollAmount = centerDistance - layout.width / 2;
    return this._normalizeScrollValue(props, scrollAmount);
  };

  _resetScrollOffset = (props: Props<T>) => {
    if (!props.scrollEnabled || !this._scrollView) {
      return;
    }

    const scrollAmount = this._getScrollAmount(
      props,
      props.navigationState.index
    );
    this._scrollView &&
      this._scrollView.scrollTo({
        x: scrollAmount,
        animated: true,
      });
    Animated.timing(this.state.offset, {
      toValue: 0,
      duration: 150,
      useNativeDriver: this.props.useNativeDriver,
    }).start();
  };

  _adjustScroll = (index: number) => {
    if (!this.props.scrollEnabled || !this._scrollView) {
      return;
    }

    const scrollAmount = this._getScrollAmount(this.props, index);

    this._scrollView &&
      this._scrollView.scrollTo({
        x: scrollAmount + this._scrollOffset,
        animated: false,
      });
  };

  _adjustOffset = (value: number) => {
    if (!this._isManualScroll || !this.props.scrollEnabled) {
      return;
    }

    const scrollAmount = this._getScrollAmount(
      this.props,
      this.props.navigationState.index
    );
    const scrollOffset = value - scrollAmount;

    if (this._isMomentumScroll) {
      Animated.spring(this.state.offset, {
        toValue: -scrollOffset,
        tension: 300,
        friction: 35,
        useNativeDriver: this.props.useNativeDriver,
      }).start();
    } else {
      this.state.offset.setValue(-scrollOffset);
    }

    this._scrollOffset = scrollOffset;
  };

  _handleScroll = (e: ScrollEvent) => {
    this._adjustOffset(e.nativeEvent.contentOffset.x);
  };

  _handleBeginDrag = () => {
    // onScrollBeginDrag fires when user touches the ScrollView
    this._isManualScroll = true;
    this._isMomentumScroll = false;
  };

  _handleEndDrag = () => {
    // onScrollEndDrag fires when user lifts his finger
    // onMomentumScrollBegin fires after touch end
    // run the logic in next frame so we get onMomentumScrollBegin first
    global.requestAnimationFrame(() => {
      if (this._isMomentumScroll) {
        return;
      }
      this._isManualScroll = false;
    });
  };

  _handleMomentumScrollBegin = () => {
    // onMomentumScrollBegin fires on flick, as well as programmatic scroll
    this._isMomentumScroll = true;
  };

  _handleMomentumScrollEnd = () => {
    // onMomentumScrollEnd fires when the scroll finishes
    this._isMomentumScroll = false;
    this._isManualScroll = false;
  };

  _needsRTLAdaptations() {
    return I18nManager.isRTL && Platform.OS === 'android';
  }

  _setRef = (el: ?ScrollView) => (this._scrollView = el);

  render() {
    const { position, navigationState, scrollEnabled } = this.props;
    const { routes, index } = navigationState;
    const maxDistance = this._getMaxScrollableDistance(this.props);
    const tabWidth = this._getTabWidth(this.props);
    const tabBarWidth = tabWidth * routes.length;

    // Prepend '-1', so there are always at least 2 items in inputRange
    const inputRange = [-1, ...routes.map((x, i) => i)];
    const translateOutputRange = inputRange.map(
      i => this._getScrollAmount(this.props, i) * -1
    );

    const translateX = Animated.add(
      position.interpolate({
        inputRange,
        outputRange: translateOutputRange,
      }),
      this.state.offset
    ).interpolate({
      inputRange: [-maxDistance, 0],
      outputRange: [-maxDistance, 0],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.tabBar, this.props.style]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicatorContainer,
            scrollEnabled
              ? { width: tabBarWidth, transform: [{ translateX }] }
              : null,
          ]}
        >
          {this._renderIndicator({
            ...this.props,
            width: tabWidth,
          })}
        </Animated.View>
        <View style={styles.scroll}>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            scrollEnabled={scrollEnabled}
            bounces={false}
            alwaysBounceHorizontal={false}
            scrollsToTop={false}
            showsHorizontalScrollIndicator={false}
            automaticallyAdjustContentInsets={false}
            overScrollMode="never"
            contentContainerStyle={[
              styles.tabContent,
              scrollEnabled ? null : styles.container,
              {
                flexDirection: this._needsRTLAdaptations()
                  ? 'row-reverse'
                  : 'row'
              }
            ]}
            scrollEventThrottle={16}
            onScroll={this._handleScroll}
            onScrollBeginDrag={this._handleBeginDrag}
            onScrollEndDrag={this._handleEndDrag}
            onMomentumScrollBegin={this._handleMomentumScrollBegin}
            onMomentumScrollEnd={this._handleMomentumScrollEnd}
            contentOffset={this.state.initialOffset}
            ref={this._setRef}
          >
            {routes.map((route, i) => {
              const focused = index === i;
              const outputRange = inputRange.map(
                inputIndex => (inputIndex === i ? 1 : 0.7)
              );
              const opacity = Animated.multiply(
                this.state.visibility,
                position.interpolate({
                  inputRange,
                  outputRange,
                })
              );
              const scene = {
                route,
                focused,
                index: i,
              };
              const label = this._renderLabel(scene);
              const icon = this.props.renderIcon
                ? this.props.renderIcon(scene)
                : null;
              const badge = this.props.renderBadge
                ? this.props.renderBadge(scene)
                : null;

              const tabStyle = {};

              tabStyle.opacity = opacity;

              if (icon) {
                if (label) {
                  tabStyle.paddingTop = 8;
                } else {
                  tabStyle.padding = 12;
                }
              }

              const passedTabStyle = StyleSheet.flatten(this.props.tabStyle);
              const isWidthSet =
                (passedTabStyle &&
                  typeof passedTabStyle.width !== 'undefined') ||
                scrollEnabled === true;
              const tabContainerStyle = {};

              if (isWidthSet) {
                tabStyle.width = tabWidth;
              }

              if (passedTabStyle && typeof passedTabStyle.flex === 'number') {
                tabContainerStyle.flex = passedTabStyle.flex;
              } else if (!isWidthSet) {
                tabContainerStyle.flex = 1;
              }

              const accessibilityLabel =
                route.accessibilityLabel || route.title;

              return (
                <TouchableItem
                  borderless
                  key={route.key}
                  testID={route.testID}
                  accessible={route.accessible}
                  accessibilityLabel={accessibilityLabel}
                  accessibilityTraits="button"
                  pressColor={this.props.pressColor}
                  pressOpacity={this.props.pressOpacity}
                  delayPressIn={0}
                  onPress={() => {
                    const { onTabPress, jumpToIndex } = this.props;
                    jumpToIndex(i);
                    if (onTabPress) {
                      onTabPress(scene);
                    }
                  }}
                  style={[tabContainerStyle, focused ? this.props.focusedtabStyle : {}]}
                >
                  <View pointerEvents="none" style={styles.container}>
                    <Animated.View
                      style={[
                        styles.tabItem,
                        tabStyle,
                        passedTabStyle,
                        styles.container,
                      ]}
                    >
                      {icon}
                      {label}
                    </Animated.View>
                    {badge ? (
                      <Animated.View
                        style={[
                          styles.badge,
                          { opacity: this.state.visibility },
                        ]}
                      >
                        {badge}
                      </Animated.View>
                    ) : null}
                  </View>
                </TouchableItem>
              );
            })}
          </ScrollView>
        </View>
      </Animated.View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    overflow: Platform.OS === 'web' ? 'auto' : 'scroll',
  },
  tabBar: {
    backgroundColor: '#2196f3',
    elevation: 4,
    shadowColor: 'black',
    shadowOpacity: 0.1,
    shadowRadius: StyleSheet.hairlineWidth,
    shadowOffset: {
      height: StyleSheet.hairlineWidth,
    },
    // We don't need zIndex on Android, disable it since it's buggy
    zIndex: Platform.OS === 'android' ? 0 : 1,
  },
  tabContent: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
  },
  tabLabel: {
    backgroundColor: 'transparent',
    color: 'white',
    margin: 8,
  },
  tabItem: {
    flexGrow: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  indicatorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  indicator: {
    backgroundColor: '#ffeb3b',
    position: 'absolute',
    left: 0,
    bottom: 0,
    right: 0,
    height: 2,
  },
});
