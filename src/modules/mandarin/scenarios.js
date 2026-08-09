/**
 * Scenario content, carried over verbatim from the standalone drill app.
 *
 *   w = 汉字      p = pinyin      e = English
 *
 * Kept in its own file so the module stays readable and adding a scenario
 * means editing data, not code.
 */
export const SCENARIOS = [
  {
    id:'greet', name:'Greeting a friend', zh:'见朋友', icon:'👋',
    convo:{
      title:'Running into a friend', sub:'两个朋友 · two friends',
      lines:[
        {who:'You', you:true, w:'你好！好久不见。', p:'nǐ hǎo! hǎo jiǔ bú jiàn', e:'Hi! Long time no see.'},
        {who:'Friend', w:'是啊，你最近怎么样？', p:'shì a, nǐ zuìjìn zěnmeyàng?', e:'Yeah, how have you been lately?'},
        {who:'You', you:true, w:'我很好，谢谢。你呢？', p:'wǒ hěn hǎo, xièxie. nǐ ne?', e:"I'm good, thanks. And you?"},
        {who:'Friend', w:'我也很好。', p:'wǒ yě hěn hǎo.', e:"I'm good too."}
      ],
      vocab:[
        {w:'你好', p:'nǐ hǎo', e:'hello'},
        {w:'好久不见', p:'hǎo jiǔ bú jiàn', e:'long time no see'},
        {w:'最近', p:'zuìjìn', e:'recently, lately'},
        {w:'怎么样', p:'zěnmeyàng', e:'how are things?'},
        {w:'很', p:'hěn', e:'very'},
        {w:'好', p:'hǎo', e:'good, fine'},
        {w:'谢谢', p:'xièxie', e:'thank you'},
        {w:'你呢', p:'nǐ ne', e:'and you?'},
        {w:'也', p:'yě', e:'also, too'}
      ]
    }
  },
  {
    id:'cafe', name:'Ordering at a café', zh:'点餐', icon:'☕',
    convo:{
      title:'Ordering a coffee', sub:'顾客和店员 · customer & staff',
      lines:[
        {who:'You', you:true, w:'你好，我要一杯咖啡。', p:'nǐ hǎo, wǒ yào yì bēi kāfēi.', e:"Hi, I'd like a cup of coffee."},
        {who:'Staff', w:'好的，要大杯还是小杯？', p:'hǎo de, yào dà bēi háishì xiǎo bēi?', e:'Sure, large or small?'},
        {who:'You', you:true, w:'大杯，谢谢。', p:'dà bēi, xièxie.', e:'Large, thank you.'},
        {who:'Staff', w:'一共三十块。', p:'yígòng sānshí kuài.', e:"That's thirty yuan total."},
        {who:'You', you:true, w:'给你。', p:'gěi nǐ.', e:'Here you go.'}
      ],
      vocab:[
        {w:'我要', p:'wǒ yào', e:'I want'},
        {w:'一杯', p:'yì bēi', e:'a cup of'},
        {w:'咖啡', p:'kāfēi', e:'coffee'},
        {w:'好的', p:'hǎo de', e:'okay, sure'},
        {w:'大', p:'dà', e:'big, large'},
        {w:'小', p:'xiǎo', e:'small'},
        {w:'还是', p:'háishì', e:'or (in a question)'},
        {w:'一共', p:'yígòng', e:'in total'},
        {w:'块', p:'kuài', e:'yuan (money)'},
        {w:'给你', p:'gěi nǐ', e:'here you go'}
      ]
    }
  },
  {
    id:'market', name:'Shopping at a supermarket', zh:'超市购物', icon:'🛒',
    convo:{
      title:'Finding what you need', sub:'在超市 · at the supermarket',
      lines:[
        {who:'You', you:true, w:'请问，牛奶在哪里？', p:'qǐngwèn, niúnǎi zài nǎlǐ?', e:'Excuse me, where is the milk?'},
        {who:'Staff', w:'在那边。', p:'zài nàbiān.', e:"It's over there."},
        {who:'You', you:true, w:'多少钱？', p:'duōshao qián?', e:'How much is it?'},
        {who:'Staff', w:'十五块一瓶。', p:'shíwǔ kuài yì píng.', e:'Fifteen yuan a bottle.'},
        {who:'You', you:true, w:'我要两瓶。', p:'wǒ yào liǎng píng.', e:"I'll take two bottles."}
      ],
      vocab:[
        {w:'请问', p:'qǐngwèn', e:'excuse me / may I ask'},
        {w:'牛奶', p:'niúnǎi', e:'milk'},
        {w:'在', p:'zài', e:'to be (located) at'},
        {w:'哪里', p:'nǎlǐ', e:'where'},
        {w:'那边', p:'nàbiān', e:'over there'},
        {w:'多少钱', p:'duōshao qián', e:'how much?'},
        {w:'瓶', p:'píng', e:'bottle (measure word)'},
        {w:'两', p:'liǎng', e:'two (of something)'}
      ]
    }
  },
  {
    id:'directions', name:'Asking for directions', zh:'问路', icon:'🧭',
    convo:{
      title:'Finding your way', sub:'问路人 · asking a passerby',
      lines:[
        {who:'You', you:true, w:'请问，洗手间在哪里？', p:'qǐngwèn, xǐshǒujiān zài nǎlǐ?', e:'Excuse me, where is the restroom?'},
        {who:'Passerby', w:'一直走，然后左转。', p:'yìzhí zǒu, ránhòu zuǒ zhuǎn.', e:'Go straight, then turn left.'},
        {who:'You', you:true, w:'离这里远吗？', p:'lí zhèlǐ yuǎn ma?', e:'Is it far from here?'},
        {who:'Passerby', w:'不远，很近。', p:'bù yuǎn, hěn jìn.', e:'Not far, very close.'},
        {who:'You', you:true, w:'谢谢你！', p:'xièxie nǐ!', e:'Thank you!'}
      ],
      vocab:[
        {w:'洗手间', p:'xǐshǒujiān', e:'restroom'},
        {w:'一直走', p:'yìzhí zǒu', e:'go straight'},
        {w:'然后', p:'ránhòu', e:'then, after that'},
        {w:'左转', p:'zuǒ zhuǎn', e:'turn left'},
        {w:'离', p:'lí', e:'(distance) from'},
        {w:'这里', p:'zhèlǐ', e:'here'},
        {w:'远', p:'yuǎn', e:'far'},
        {w:'近', p:'jìn', e:'near, close'}
      ]
    }
  }
];
