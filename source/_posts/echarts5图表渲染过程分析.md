---
title: echarts5图表渲染过程分析
author: 王登武
date: 2021-11-10 16:35:17
categories: 前端
tags: 
 - 图表
  - echarts
 
---

### Echarts快速入门
Echarts就不做过多介绍了，相信大家都听说或者使用过，现在以官方给的第一个快速入门为基础，分析一下渲染过程。示例代码如下

``` javascript
<div id="main" style="width: 600px;height:400px;"></div>
<script type="text/javascript">

    // 基于准备好的dom，初始化echarts实例
    var myChart = echarts.init(document.getElementById('main'));

    // 指定图表的配置项和数据
    var option = {
      title: {
        text: 'ECharts 入门示例'
      },
      tooltip: {},
      legend: {
        data: ['销量']
      },
      xAxis: {
        data: ['衬衫', '羊毛衫', '雪纺衫', '裤子', '高跟鞋', '袜子']
      },
      yAxis: {},
      series: [
        {
          name: '销量',
          type: 'bar',
          data: [5, 20, 36, 10, 10, 20]
        }
      ]
    };

    // 使用刚指定的配置项和数据显示图表。
    myChart.setOption(option);
  </script>
```
渲染出来的效果就是这样的
![](https://img.dengwu.wang/blog/20211112181806.png)
### 代码分析
echarts是依赖zrender来绘制的，上述代码可以看到调用了echarts的2个方法，**init**和**setOption**,5.x版本的echarts是使用typescript写的。
先看下init方法的定义,在src/echarts.ts里,为了更简洁清晰，后续代码我删掉了非主干流程渲染的部分内容。

``` javascript
import { init } from './core/echarts';
export default {
    init() {
        return init.apply(null, arguments);
    }
};
```
真正的init方法其实是./core/echarts里的

``` javascript
export function init(
    dom: HTMLElement,
    theme?: string | object,
    opts?: EChartsInitOpts
): EChartsType {
    const existInstance = getInstanceByDom(dom);
    if (existInstance) {
         return existInstance;
    }
    const chart = new ECharts(dom, theme, opts);
    chart.id = 'ec_' + idBase++;
    instances[chart.id] = chart;

    modelUtil.setAttribute(dom, DOM_ATTRIBUTE_KEY, chart.id);

    enableConnect(chart);

    lifecycle.trigger('afterinit', chart);

    return chart;
}
```
代码实例化了ECharts对象，构造函数代码

``` javascript
class ECharts extends Eventful<ECEventDefinition> {
	 constructor(
	        dom: HTMLElement,
	        // Theme name or themeOption.
	        theme?: string | ThemeOption,
	        opts?: EChartsInitOpts
	    ) {
	        super(new ECEventProcessor());
	
	        opts = opts || {};
	
	        // Get theme by name
	        if (typeof theme === 'string') {
	            theme = themeStorage[theme] as object;
	        }
	
	        this._dom = dom;
	
	        let defaultRenderer = 'canvas';
	        let defaultUseDirtyRect = false;
	        
	        const zr = this._zr = zrender.init(dom, {
	            renderer: opts.renderer || defaultRenderer,
	            devicePixelRatio: opts.devicePixelRatio,
	            width: opts.width,
	            height: opts.height,
	            useDirtyRect: opts.useDirtyRect == null ? defaultUseDirtyRect : opts.useDirtyRect
	        });
	
	        // Expect 60 fps.
	        this._throttledZrFlush = throttle(bind(zr.flush, zr), 17);
	
	        theme = clone(theme);
	        theme && backwardCompat(theme as ECUnitOption, true);
	
	        this._theme = theme;
	
	        this._locale = createLocaleObject(opts.locale || SYSTEM_LANG);
	
	        this._coordSysMgr = new CoordinateSystemManager();
	
	        const api = this._api = createExtensionAPI(this);
	
	        // Sort on demand
	        function prioritySortFunc(a: StageHandlerInternal, b: StageHandlerInternal): number {
	            return a.__prio - b.__prio;
	        }
	        timsort(visualFuncs, prioritySortFunc);
	        timsort(dataProcessorFuncs, prioritySortFunc);
	
	        this._scheduler = new Scheduler(this, api, dataProcessorFuncs, visualFuncs);
	
	        this._messageCenter = new MessageCenter();
	
	        // Init mouse events
	        this._initEvents();
	
	        // In case some people write `window.onresize = chart.resize`
	        this.resize = bind(this.resize, this);
	
	        zr.animation.on('frame', this._onframe, this);
	
	        bindRenderedEvent(zr, this);
	
	        bindMouseEvent(zr, this);
	
	        // ECharts instance can be used as value.
	        setAsPrimitive(this);
	  }
    }
``` 
内容比较多，重点代码是初始化了zrender

``` javascript
const zr = this._zr = zrender.init(dom, {
	            renderer: opts.renderer || defaultRenderer,
	            devicePixelRatio: opts.devicePixelRatio,
	            width: opts.width,
	            height: opts.height,
	            useDirtyRect: opts.useDirtyRect == null ? defaultUseDirtyRect : opts.useDirtyRect
 });
```
初始化了`this._scheduler = new Scheduler(this, api, dataProcessorFuncs, visualFuncs);`,后续series渲染的时候会用到。
同时注册了渲染回调`zr.animation.on('frame', this._onframe, this);`

在分析setOption方法之前，有必要先说一下echarts的组件设计思想，我们示例里看到的绘制出来的图形，其实是很多组件构成的，echarts主要分成2类，一类是ComponentView，一类是ChartView。分别在src/chart下面和src/component下面。
先看下父类ComponentView(src/view/Component.ts)定义

``` javascript
class ComponentView {
    readonly group: ViewRootGroup;
    readonly uid: string;
    __model: ComponentModel;
    __alive: boolean;
    __id: string;

    constructor() {
        this.group = new Group();
        this.uid = componentUtil.getUID('viewComponent');
    }

    init(ecModel: GlobalModel, api: ExtensionAPI): void {}

    render(model: ComponentModel, ecModel: GlobalModel, api: ExtensionAPI, payload: Payload): void {}

    dispose(ecModel: GlobalModel, api: ExtensionAPI): void {}

    updateView(model: ComponentModel, ecModel: GlobalModel, api: ExtensionAPI, payload: Payload): void {
        // Do nothing;
    }

    updateLayout(model: ComponentModel, ecModel: GlobalModel, api: ExtensionAPI, payload: Payload): void {
        // Do nothing;
    }

    updateVisual(model: ComponentModel, ecModel: GlobalModel, api: ExtensionAPI, payload: Payload): void {
        // Do nothing;
    }

    /**
     * Hook for blur target series.
     * Can be used in marker for blur the markers
     */
    blurSeries(seriesModels: SeriesModel[], ecModel: GlobalModel): void {
         // Do nothing;
    }

    static registerClass: clazzUtil.ClassManager['registerClass'];
};
```
最主要的2个方法init和render是由各个组件子类来实现的。
ChartView(src/view/Chart.ts)

``` javascript
class ChartView {
    type: string;
    readonly group: ViewRootGroup;
    readonly uid: string;
    readonly renderTask: SeriesTask;
    ignoreLabelLineUpdate: boolean;
    __alive: boolean;
    __model: SeriesModel;
    __id: string;

    static protoInitialize = (function () {
        const proto = ChartView.prototype;
        proto.type = 'chart';
    })();

    constructor() {
        this.group = new Group();
        this.uid = componentUtil.getUID('viewChart');

        this.renderTask = createTask<SeriesTaskContext>({
            plan: renderTaskPlan,
            reset: renderTaskReset
        });
        this.renderTask.context = {view: this} as SeriesTaskContext;
    }

    init(ecModel: GlobalModel, api: ExtensionAPI): void {}

    render(seriesModel: SeriesModel, ecModel: GlobalModel, api: ExtensionAPI, payload: Payload): void {}

    highlight(seriesModel: SeriesModel, ecModel: GlobalModel, api: ExtensionAPI, payload: Payload): void {
        toggleHighlight(seriesModel.getData(), payload, 'emphasis');
    }

    downplay(seriesModel: SeriesModel, ecModel: GlobalModel, api: ExtensionAPI, payload: Payload): void {
        toggleHighlight(seriesModel.getData(), payload, 'normal');
    }

    remove(ecModel: GlobalModel, api: ExtensionAPI): void {
        this.group.removeAll();
    }
    dispose(ecModel: GlobalModel, api: ExtensionAPI): void {}
    updateView(seriesModel: SeriesModel, ecModel: GlobalModel, api: ExtensionAPI, payload: Payload): void {
        this.render(seriesModel, ecModel, api, payload);
    }

    // FIXME never used?
    updateLayout(seriesModel: SeriesModel, ecModel: GlobalModel, api: ExtensionAPI, payload: Payload): void {
        this.render(seriesModel, ecModel, api, payload);
    }

    // FIXME never used?
    updateVisual(seriesModel: SeriesModel, ecModel: GlobalModel, api: ExtensionAPI, payload: Payload): void {
        this.render(seriesModel, ecModel, api, payload);
    }

    static markUpdateMethod(payload: Payload, methodName: keyof ChartView): void {
        inner(payload).updateMethod = methodName;
    }

    static registerClass: clazzUtil.ClassManager['registerClass'];
};
```
也是需要关注init和render方法，但是额外不一样的是构造函数里初始化了renderTask，这块在渲染数据的时候会用到。
下面再回到setOption方法，我们来看看setOption(src/core/echarts.ts)的实现

``` javascript
setOption<Opt extends ECBasicOption>(option: Opt, notMerge?: boolean | SetOptionOpts, lazyUpdate?: boolean): void {
        if (this._disposed) {
            disposedWarning(this.id);
            return;
        }

        let silent;
        let replaceMerge;
        let transitionOpt: SetOptionTransitionOpt;
        if (isObject(notMerge)) {
            lazyUpdate = notMerge.lazyUpdate;
            silent = notMerge.silent;
            replaceMerge = notMerge.replaceMerge;
            transitionOpt = notMerge.transition;
            notMerge = notMerge.notMerge;
        }

        this[IN_MAIN_PROCESS_KEY] = true;

        if (!this._model || notMerge) {
            const optionManager = new OptionManager(this._api);
            const theme = this._theme;
            const ecModel = this._model = new GlobalModel();
            ecModel.scheduler = this._scheduler;
            ecModel.init(null, null, null, theme, this._locale, optionManager);
        }

        this._model.setOption(option as ECBasicOption, { replaceMerge }, optionPreprocessorFuncs);

        const updateParams = {
            seriesTransition: transitionOpt,
            optionChanged: true
        } as UpdateLifecycleParams;

        if (lazyUpdate) {
            this[PENDING_UPDATE] = {
                silent: silent,
                updateParams: updateParams
            };
            this[IN_MAIN_PROCESS_KEY] = false;

            // `setOption(option, {lazyMode: true})` may be called when zrender has been slept.
            // It should wake it up to make sure zrender start to render at the next frame.
            this.getZr().wakeUp();
        }
        else {
            prepare(this);

            updateMethods.update.call(this, null, updateParams);

            // Ensure zr refresh sychronously, and then pixel in canvas can be
            // fetched after `setOption`.
            this._zr.flush();

            this[PENDING_UPDATE] = null;
            this[IN_MAIN_PROCESS_KEY] = false;

            flushPendingActions.call(this, silent);
            triggerUpdatedEvent.call(this, silent);
        }
    }
```
初始化model，`this._model.setOption(option as ECBasicOption, { replaceMerge }, optionPreprocessorFuncs);` 
`prepare(this);`的方法实现

``` javascript
prepare = function (ecIns: ECharts): void {
            const scheduler = ecIns._scheduler;

            scheduler.restorePipelines(ecIns._model);
            scheduler.prepareStageTasks();

            prepareView(ecIns, true);
            prepareView(ecIns, false);

            scheduler.plan();
};
```
``` javascript
restorePipelines(ecModel: GlobalModel): void {
        const scheduler = this;
        const pipelineMap = scheduler._pipelineMap = createHashMap();

        ecModel.eachSeries(function (seriesModel) {
            const progressive = seriesModel.getProgressive();
            const pipelineId = seriesModel.uid;

            pipelineMap.set(pipelineId, {
                id: pipelineId,
                head: null,
                tail: null,
                threshold: seriesModel.getProgressiveThreshold(),
                progressiveEnabled: progressive
                    && !(seriesModel.preventIncremental && seriesModel.preventIncremental()),
                blockIndex: -1,
                step: Math.round(progressive || 700),
                count: 0
            });

            scheduler._pipe(seriesModel, seriesModel.dataTask);
        });
    }
```
其中seriesModel的内容:
![](https://img.dengwu.wang/blog/20211113135714.png)

``` javascript
private _pipe(seriesModel: SeriesModel, task: GeneralTask) {
        const pipelineId = seriesModel.uid;
        const pipeline = this._pipelineMap.get(pipelineId);
        !pipeline.head && (pipeline.head = task);
        pipeline.tail && pipeline.tail.pipe(task);
        pipeline.tail = task;
        task.__idxInPipeline = pipeline.count++;
        task.__pipeline = pipeline;
  }
```
通过_pipe方法就将task加到了pipeline里，等待后续执行task进行渲染。
prepareView(ecIns, true);
prepareView(ecIns, false);
分别执行ComponentView和ChartView的init方法，具体怎么找到对应的clazz呢？

``` javascript
function doPrepare(model: ComponentModel): void {
                const requireNewView = model.__requireNewView;
                model.__requireNewView = false;
                const viewId = '_ec_' + model.id + '_' + model.type;
                let view = !requireNewView && viewMap[viewId];
                if (!view) {
                    const classType = parseClassType(model.type);
                    const Clazz = isComponent
                        ? (ComponentView as ComponentViewConstructor).getClass(classType.main, classType.sub)
                        : (
                                     (ChartView as ChartViewConstructor).getClass(classType.sub)
                        );

                    if (__DEV__) {
                        assert(Clazz, classType.sub + ' does not exist.');
                    }

                    view = new Clazz();
                    view.init(ecModel, api);
                    viewMap[viewId] = view;
                    viewList.push(view as any);
                    zr.add(view.group);
                }

                model.__viewId = view.__id = viewId;
                view.__alive = true;
                view.__model = model;
                view.group.__ecComponentInfo = {
                    mainType: model.mainType,
                    index: model.componentIndex
                };
                !isComponent && scheduler.prepareView(
                    view as ChartView, model as SeriesModel, ecModel, api
                );
     }
```

``` javascript
(ComponentView as ComponentViewConstructor).getClass(classType.main, classType.sub)

import * as clazzUtil from '../util/clazz';
export type ComponentViewConstructor = typeof ComponentView
    & clazzUtil.ExtendableConstructor
    & clazzUtil.ClassManager;

clazzUtil.enableClassExtend(ComponentView as ComponentViewConstructor);
clazzUtil.enableClassManagement(ComponentView as ComponentViewConstructor);

target.getClass = function (
        mainType: ComponentMainType,
        subType?: ComponentSubType,
        throwWhenNotFound?: boolean
    ): Constructor {
        let clz = storage[mainType];

        if (clz && (clz as SubclassContainer)[IS_CONTAINER]) {
            clz = subType ? (clz as SubclassContainer)[subType] : null;
        }

        if (throwWhenNotFound && !clz) {
            throw new Error(
                !subType
                    ? mainType + '.' + 'type should be specified.'
                    : 'Component ' + mainType + '.' + (subType || '') + ' is used but not imported.'
            );
        }

        return clz as Constructor;
 };
 
 target.registerClass = function (
        clz: Constructor
    ): Constructor {
        const componentFullType = (clz as any).type || clz.prototype.type;
        if (componentFullType) {
            checkClassType(componentFullType);
            clz.prototype.type = componentFullType;
            const componentTypeInfo = parseClassType(componentFullType);
            if (!componentTypeInfo.sub) {
                    storage[componentTypeInfo.main] = clz;
            }
            else if (componentTypeInfo.sub !== IS_CONTAINER) {
                const container = makeContainer(componentTypeInfo);
                container[componentTypeInfo.sub] = clz;
            }
        }
        return clz;
  };
  //以TitleView为例
  class TitleView extends ComponentView {

    static type = 'title' as const;
    type = TitleView.type;
```
``` javascript
prepareView(view: ChartView, model: SeriesModel, ecModel: GlobalModel, api: ExtensionAPI): void {
        const renderTask = view.renderTask;
        const context = renderTask.context;

        context.model = model;
        context.ecModel = ecModel;
        context.api = api;

        renderTask.__block = !view.incrementalPrepareRender;

        this._pipe(model, renderTask);
    }
```
 
而BarView不同的地方在，将renderTask加入了pipeline。
setOption里的`prepare(this);`执行完了，总结一下就是初始化Model，初始化对应的ComponentView和ChartView并将series对应的task加入pipeline，再来看下`updateMethods.update.call(this, null, updateParams);`

``` javascript
updateMethods = {
            update(this: ECharts, payload: Payload, updateParams: UpdateLifecycleParams): void {
                const ecModel = this._model;
                const api = this._api;
                const zr = this._zr;
                const coordSysMgr = this._coordSysMgr;
                const scheduler = this._scheduler;
                // update before setOption
                if (!ecModel) {
                    return;
                }
                ecModel.setUpdatePayload(payload);
                scheduler.restoreData(ecModel, payload);
                scheduler.performSeriesTasks(ecModel);
                coordSysMgr.create(ecModel, api);
                scheduler.performDataProcessorTasks(ecModel, payload);
                updateStreamModes(this, ecModel);
                coordSysMgr.update(ecModel, api);
                clearColorPalette(ecModel);
                scheduler.performVisualTasks(ecModel, payload);
                
                render(this, ecModel, api, payload, updateParams);

                // Set background
                let backgroundColor = ecModel.get('backgroundColor') || 'transparent';
                const darkMode = ecModel.get('darkMode');

                // In IE8
                if (!env.canvasSupported) {
                    const colorArr = colorTool.parse(backgroundColor as ColorString);
                    backgroundColor = colorTool.stringify(colorArr, 'rgb');
                    if (colorArr[3] === 0) {
                        backgroundColor = 'transparent';
                    }
                }
                else {
                    zr.setBackgroundColor(backgroundColor);

                    // Force set dark mode.
                    if (darkMode != null && darkMode !== 'auto') {
                        zr.setDarkMode(darkMode);
                    }
                }

                lifecycle.trigger('afterupdate', ecModel, api);
            },

```
最主要的是`render(this, ecModel, api, payload, updateParams);`方法，

``` javascript
render = (
            ecIns: ECharts, ecModel: GlobalModel, api: ExtensionAPI, payload: Payload,
            updateParams: UpdateLifecycleParams
        ) => {

            renderComponents(ecIns, ecModel, api, payload, updateParams);

            each(ecIns._chartsViews, function (chart: ChartView) {
                chart.__alive = false;
            });

            renderSeries(ecIns, ecModel, api, payload, updateParams);

            // Remove groups of unrendered charts
            each(ecIns._chartsViews, function (chart: ChartView) {
                if (!chart.__alive) {
                    chart.remove(ecModel, api);
                }
            });
     };
```
先来看下`renderComponents(ecIns, ecModel, api, payload, updateParams);`

``` javascript
renderComponents = (
            ecIns: ECharts, ecModel: GlobalModel, api: ExtensionAPI, payload: Payload,
            updateParams: UpdateLifecycleParams, dirtyList?: ComponentView[]
        ) => {
            each(dirtyList || ecIns._componentsViews, function (componentView: ComponentView) {
                const componentModel = componentView.__model;
                clearStates(componentModel, componentView);

                componentView.render(componentModel, ecModel, api, payload);

                updateZ(componentModel, componentView);

                updateStates(componentModel, componentView);
            });

    };
```
ecIns就是echarts实例，那针对这个示例都有哪些_componentsViews呢，
![](https://img.dengwu.wang/blog/20211114010528.png)
拿其中一个TitleView来细看一下

``` javascript
render(titleModel: TitleModel, ecModel: GlobalModel, api: ExtensionAPI) {
        this.group.removeAll();
        const group = this.group;

       
        const textEl = new graphic.Text({
            style: createTextStyle(textStyleModel, {
                text: titleModel.get('text'),
                fill: textStyleModel.getTextColor()
            }, {disableBox: true}),
            z2: 10
        });

        group.add(textEl);
        
    }
}
```
render方法实在太长了，我删掉了样式，子标题，背景，标题框等相关代码，只留下Text渲染相关的了。
可以看到，真正的渲染是调用了zrender的graphic.Text，并添加到了group里。
再来看renderSeries

``` javascript
renderSeries = (
            ecIns: ECharts,
            ecModel: GlobalModel,
            api: ExtensionAPI,
            payload: Payload | 'remain',
            updateParams: UpdateLifecycleParams,
            dirtyMap?: {[uid: string]: any}
        ) => {
            // Render all charts
            const scheduler = ecIns._scheduler;

            updateParams = extend(updateParams || {}, {
                updatedSeries: ecModel.getSeries()
            });

            let unfinished: boolean = false;
            ecModel.eachSeries(function (seriesModel) {
                const chartView = ecIns._chartsMap[seriesModel.__viewId];
                chartView.__alive = true;

                const renderTask = chartView.renderTask;
                 if (renderTask.perform(scheduler.getPerformArgs(renderTask))) {
                    unfinished = true;
                }

            });
     };
```
最重要的就是调用了renderTask.perform
Task(src/core/task.ts)的perform方法。方法比较长，我就不贴代码了，主干是调用了`                    this._doProgress(progress, start, end, modBy, modDataCount);`

``` javascript
const progressMethodMap: {[method: string]: TaskResetCallbackReturn<SeriesTaskContext>} = {
    incrementalPrepareRender: {
        progress: function (params: StageHandlerProgressParams, context: SeriesTaskContext): void {
            context.view.incrementalRender(
                params, context.model, context.ecModel, context.api, context.payload
            );
        }
    },
    render: {
        // Put view.render in `progress` to support appendData. But in this case
        // view.render should not be called in reset, otherwise it will be called
        // twise. Use `forceFirstProgress` to make sure that view.render is called
        // in any cases.
        forceFirstProgress: true,
        progress: function (params: StageHandlerProgressParams, context: SeriesTaskContext): void {
            context.view.render(
                context.model, context.ecModel, context.api, context.payload
            );
        }
    }
};
```
紧接着调用了progress方法，而progress方法里调用了view的render，以此示例的BarView举例

``` javascript
render(seriesModel: BarSeriesModel, ecModel: GlobalModel, api: ExtensionAPI, payload: Payload) {
        this._model = seriesModel;

        this._removeOnRenderedListener(api);

        this._updateDrawMode(seriesModel);

        const coordinateSystemType = seriesModel.get('coordinateSystem');

        if (coordinateSystemType === 'cartesian2d'
            || coordinateSystemType === 'polar'
        ) {
            this._isLargeDraw
                ? this._renderLarge(seriesModel, ecModel, api)
                : this._renderNormal(seriesModel, ecModel, api, payload);
        }
        else if (__DEV__) {
            warn('Only cartesian2d and polar supported for bar.');
        }
    }
```
根据是否是_isLargeDraw而分别调用不同的render，本示走的是_renderNormal方法。

``` javascript
private _renderNormal(
        seriesModel: BarSeriesModel,
        ecModel: GlobalModel,
        api: ExtensionAPI,
        payload: Payload
    ): void {
        const group = this.group;
        const data = seriesModel.getData();
        const oldData = this._data;
        data.diff(oldData)
            .add(function (dataIndex) {
                const itemModel = data.getItemModel<BarDataItemOption>(dataIndex);
                const layout = getLayout[coord.type](data, dataIndex, itemModel);
                const el = elementCreator[coord.type](
                    seriesModel,
                    data,
                    dataIndex,
                    layout,
                    isHorizontalOrRadial,
                    animationModel,
                    baseAxis.model,
                    false,
                    roundCap
                );
                group.add(el);
            })
            .execute();
        this._data = data;
    }
    
    const elementCreator: {
    [key in 'polar' | 'cartesian2d']: ElementCreator
} = {
    cartesian2d(
        seriesModel, data, newIndex, layout: RectLayout, isHorizontal,
        animationModel, axisModel, isUpdate, roundCap
    ) {
        const rect = new Rect({
            shape: extend({}, layout),
            z2: 1
        });
        (rect as any).__dataIndex = newIndex;

        rect.name = 'item';

        if (animationModel) {
            const rectShape = rect.shape;
            const animateProperty = isHorizontal ? 'height' : 'width' as 'width' | 'height';
            rectShape[animateProperty] = 0;
        }
        return rect;
    },
};
```
方法太长，我删掉了非主干代码，可以看到最终根据Model的data的diff来进行add,update,remove,最终还是调用了zrender的Rect来画出bar的样子。
最后贴一下渲染BarView的调用栈
![](https://img.dengwu.wang/blog/20211114021358.png)
渲染ComponentView比较直接，而渲染ChartView类型的就绕来绕去，主要原因是ChartView可能数据比较多，需要逐步分批渲染，以减少卡顿，保持每秒60帧的渲染，因为1000ms，每一帧不能超过16ms，才能保持流畅的渲染。
在setOption方法的最后调用了`this._zr.flush();`则直接将绘制渲染出来了，当然对于ChartView的绘制，可能还需要等到下一次渲染的时候才会显示出来。

``` javascript 
private _onframe(): void {
        if (this._disposed) {
            return;
        }

        applyChangedStates(this);

        const scheduler = this._scheduler;

        // Lazy update
        if (this[PENDING_UPDATE]) {
            const silent = (this[PENDING_UPDATE] as any).silent;

            this[IN_MAIN_PROCESS_KEY] = true;

            prepare(this);
            updateMethods.update.call(this, null, this[PENDING_UPDATE].updateParams);

            // At present, in each frame, zrender performs:
            //   (1) animation step forward.
            //   (2) trigger('frame') (where this `_onframe` is called)
            //   (3) zrender flush (render).
            // If we do nothing here, since we use `setToFinal: true`, the step (3) above
            // will render the final state of the elements before the real animation started.
            this._zr.flush();

            this[IN_MAIN_PROCESS_KEY] = false;

            this[PENDING_UPDATE] = null;

            flushPendingActions.call(this, silent);

            triggerUpdatedEvent.call(this, silent);
        }
        // Avoid do both lazy update and progress in one frame.
        else if (scheduler.unfinished) {
            // Stream progress.
            let remainTime = TEST_FRAME_REMAIN_TIME;
            const ecModel = this._model;
            const api = this._api;
            scheduler.unfinished = false;
            do {
                const startTime = +new Date();

                scheduler.performSeriesTasks(ecModel);

                // Currently dataProcessorFuncs do not check threshold.
                scheduler.performDataProcessorTasks(ecModel);

                updateStreamModes(this, ecModel);

                // Do not update coordinate system here. Because that coord system update in
                // each frame is not a good user experience. So we follow the rule that
                // the extent of the coordinate system is determin in the first frame (the
                // frame is executed immedietely after task reset.
                // this._coordSysMgr.update(ecModel, api);

                // console.log('--- ec frame visual ---', remainTime);
                scheduler.performVisualTasks(ecModel);

                renderSeries(this, this._model, api, 'remain', {});

                remainTime -= (+new Date() - startTime);
            }
            while (remainTime > 0 && scheduler.unfinished);

            // Call flush explicitly for trigger finished event.
            if (!scheduler.unfinished) {
                this._zr.flush();
            }
            // Else, zr flushing be ensue within the same frame,
            // because zr flushing is after onframe event.
        }
   }
```
对于echarts的渲染分析就到这了，下次有机会我们自己动手写一个ChartView。