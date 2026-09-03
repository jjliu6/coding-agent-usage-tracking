// ~100 rest / move prompts. Each hair stage keeps its own pool; the dashboard
// draws 2–3 at random and holds that offer until the user finishes one.
var ACT_LIST = [];
function addAct(stage, id, en, zh) {
  ACT_LIST.push({ id, stage, en, zh });
}

// high: still at the desk, 20–60 seconds
addAct('high', 'actStretch', 'Stand up and stretch 30 seconds', '站起来伸个懒腰 30 秒');
addAct('high', 'actWater', 'Drink a glass of water', '喝一杯水');
addAct('high', 'actWindow', 'Look out the window for 20 seconds', '看窗外 20 秒');
addAct('high', 'actNeckRoll', 'Slow neck rolls, 20 seconds', '慢慢转脖子 20 秒');
addAct('high', 'actShrug', 'Shrug your shoulders 10 times', '耸肩 10 次');
addAct('high', 'actWrist', 'Wrist circles 20 seconds', '转转手腕 20 秒');
addAct('high', 'actBlink', 'Blink slowly 15 times', '慢慢眨眼 15 次');
addAct('high', 'actPosture', 'Sit up tall for 30 seconds', '坐直 30 秒');
addAct('high', 'actJaw', 'Unclench your jaw, drop your tongue', '别咬着牙，舌头放松');
addAct('high', 'actArmShake', 'Drop your arms and shake them out', '放下手臂抖一抖');
addAct('high', 'actAnkle', 'Ankle circles under the desk', '在桌子底下转转脚踝');
addAct('high', 'actLookGreen', 'Look at something green for 20 seconds', '看看绿色的东西 20 秒');
addAct('high', 'actSipWater', 'Sip water — not another coffee', '喝口水，先别续咖啡');
addAct('high', 'actReachUp', 'Stand and reach for the ceiling', '站起来，双手用力往上够');
addAct('high', 'actEarShoulder', 'Ear-to-shoulder stretch, both sides', '头往肩膀方向压一压，两边都做');
addAct('high', 'actPalmPress', 'Interlace fingers and press palms out', '十指交叉，手心向外推');
addAct('high', 'actShoulderBack', 'Roll shoulders back 10 times', '肩膀向后转 10 圈');
addAct('high', 'actEyesClosed', 'Close your eyes for 20 seconds', '闭眼 20 秒');
addAct('high', 'actWiggleToes', 'Wiggle your toes inside your shoes', '在鞋子里动动脚趾');
addAct('high', 'actLoosenMouse', 'Let go of the mouse and uncurl your hand', '松开鼠标，把手摊开');
addAct('high', 'actScreenArm', 'Push the screen to arm’s length', '把屏幕推远到一臂的距离');
addAct('high', 'actFiveBreaths', 'Five slow breaths, longer on the exhale', '慢慢深呼吸 5 次，呼气拉长一点');
addAct('high', 'actLookAround', 'Look left, then right, slowly', '慢慢向左看，再向右看');
addAct('high', 'actChinTuck', 'Chin tucks × 8', '收下巴 8 次');
addAct('high', 'actHandPump', 'Open and close your hands 15 times', '握拳张开 15 次');
addAct('high', 'actCalfSeat', 'Flex your calves while seated', '坐着绷一绷小腿');
addAct('high', 'actUncross', 'Uncross your legs and plant both feet', '别再翘腿，双脚放平');
addAct('high', 'actTiptoe', 'Stand on tiptoes 10 times', '踮脚 10 次');
addAct('high', 'actPalmEyes', 'Rub palms warm, cup your eyes', '搓热手心，捂住眼睛');
addAct('high', 'actFiveSounds', 'Name 5 sounds you can hear', '数一数你能听到的 5 种声音');
addAct('high', 'actFaceAway', 'Turn your chair away from the screen 30 seconds', '把椅子转过去，背对屏幕 30 秒');
addAct('high', 'actFillBottle', 'Fill your water bottle', '把水杯加满');
addAct('high', 'actFingerStretch', 'Spread your fingers wide, 10 times', '手指尽量张开 10 次');
addAct('high', 'actDropShoulders', 'Drop your shoulders away from your ears', '别耸肩，把肩膀沉下来');

// mid: stand up, 1–3 minutes
addAct('mid', 'actStand', 'Stand and roll your shoulders', '站起来转转肩膀');
addAct('mid', 'actSquats', 'Do 10 easy squats', '做 10 个轻松深蹲');
addAct('mid', 'actEyes', '20-20-20: look 20 feet away for 20 seconds', '20-20-20：看 6 米外 20 秒');
addAct('mid', 'actKitchen', 'Walk to the kitchen and back', '走到厨房再回来');
addAct('mid', 'actWallPush', '10 easy wall push-ups', '靠墙俯卧撑 10 次');
addAct('mid', 'actMarch', 'March in place 45 seconds', '原地踏步 45 秒');
addAct('mid', 'actCalfRaise', 'Calf raises × 20', '提踵 20 次');
addAct('mid', 'actHipCircle', 'Hip circles 20 seconds', '转胯 20 秒');
addAct('mid', 'actForwardFold', 'Forward fold, hang 20 seconds', '身体前屈，垂下来放松 20 秒');
addAct('mid', 'actTorsoTwist', 'Twist your torso both ways', '左右转体');
addAct('mid', 'actOneFoot', 'Stand on one foot 20s each side', '单脚站 20 秒，换边');
addAct('mid', 'actSitStand', 'Sit-to-stands × 15', '坐下站起 15 次');
addAct('mid', 'actArmCircle', 'Arm circles 20 seconds', '抡一抡胳膊 20 秒');
addAct('mid', 'actLapWalk', 'Walk a lap around your space', '在屋里走一圈');
addAct('mid', 'actBodyShake', 'Shake out your whole body 15 seconds', '全身抖一抖 15 秒');
addAct('mid', 'actDoorStretch', 'Doorway chest stretch 20 seconds', '门框拉伸胸口 20 秒');
addAct('mid', 'actHamstring', 'Hamstring stretch 20s each leg', '拉伸大腿后侧，每边 20 秒');
addAct('mid', 'actCatCow', 'Standing cat-cow × 8', '站着做猫牛式 8 次');
addAct('mid', 'actJacks', '10 easy jumping jacks', '开合跳 10 次，轻松来');
addAct('mid', 'actHighKnees', 'High knees 20 seconds', '高抬腿 20 秒');
addAct('mid', 'actToeTouch', 'Touch your toes 8 times', '手摸脚尖 8 次');
addAct('mid', 'actWallSit', 'Wall sit 20 seconds', '靠墙静蹲 20 秒');
addAct('mid', 'actNeckShoulder', 'Neck stretch + shoulder rolls', '拉伸脖子再转肩');
addAct('mid', 'actStairsOnce', 'Take the stairs once', '上下一趟楼梯');
addAct('mid', 'actSoftBounce', 'Stand and bounce softly 20 seconds', '站着轻轻颠 20 秒');
addAct('mid', 'actSideLunge', 'Side lunges, 6 each side', '侧弓步，每边 6 次');
addAct('mid', 'actGluteSqueeze', 'Glute squeezes × 15', '夹臀 15 次');
addAct('mid', 'actFarLook', 'Stand and look far away for 1 minute', '站着看远处 1 分钟');
addAct('mid', 'actCarryThing', 'Carry something to another room', '拿点东西送到另一个房间');
addAct('mid', 'actAirSquat', '10 slow air squats', '10 个慢速深蹲');
addAct('mid', 'actOpenWindow', 'Open a window and breathe the air', '开窗吸一口外面的空气');
addAct('mid', 'actHipOpener', 'Hip opener, 20s each side', '开髋，每边 20 秒');
addAct('mid', 'actCalfWalk', 'Walk on your toes to the door and back', '踮脚走到门口再回来');

// low: leave the desk, rest 2–5 minutes
addAct('low', 'actWalk', 'Walk to another room and back', '走到另一个房间再回来');
addAct('low', 'actGrass', 'Touch some grass / step outside', '出门踩两脚草 / 透个气');
addAct('low', 'actTea', 'Make tea and rest 2 minutes', '泡杯茶休息 2 分钟');
addAct('low', 'actBlockWalk', 'Walk around the block if you can', '能出门的话绕小区走一圈');
addAct('low', 'actLegsUp', 'Lie down, legs up the wall, 1 minute', '躺下，腿靠墙 1 分钟');
addAct('low', 'actSnackAway', 'Eat a snack away from the screen', '离开屏幕吃点东西');
addAct('low', 'actStepOutside', 'Step outside for 2 minutes', '出门站 2 分钟');
addAct('low', 'actWaterPlant', 'Water a plant', '给植物浇点水');
addAct('low', 'actFloorStretch', 'Stretch on the floor 2 minutes', '在地板上拉伸 2 分钟');
addAct('low', 'actWalkTalk', 'Walk while you send one message', '边走边回一条消息');
addAct('low', 'actWashFace', 'Wash your face with cool water', '用凉水洗把脸');
addAct('low', 'actDishes', 'Do the dishes for 2 minutes', '洗 2 分钟碗');
addAct('low', 'actBalcony', 'Sit on the balcony / stoop', '去阳台或门口坐一会儿');
addAct('low', 'actSkipElevator', 'Take the stairs, skip the elevator', '走楼梯，别坐电梯');
addAct('low', 'actSunFace', 'Put sunlight on your face 1 minute', '让阳光照在脸上 1 分钟');
addAct('low', 'actLieDown', 'Lie down, no phone, 2 minutes', '躺 2 分钟，别拿手机');
addAct('low', 'actGetMail', 'Walk to get the mail / packages', '下楼取个快递或信件');
addAct('low', 'actOneSong', 'Play one song and move to it', '放一首歌，跟着动一动');
addAct('low', 'actTidyStand', 'Tidy one surface while standing', '站着收拾一块桌面');
addAct('low', 'actPetIfAny', 'Pet an animal if you have one', '有宠物的话去摸两下');
addAct('low', 'actLookSky', 'Look at the sky for 1 minute', '看天空 1 分钟');
addAct('low', 'actHallway3', 'Slow walk down the hallway 3 times', '走廊慢慢走 3 个来回');
addAct('low', 'actDarkEyes', 'Rest your eyes in a darker room 1 minute', '去暗一点的房间歇眼 1 分钟');
addAct('low', 'actHipFlexor', 'Hip-flexor stretch 30s each side', '拉伸髂腰肌，每边 30 秒');
addAct('low', 'actBodyScan', '2-minute body scan, no screen', '2 分钟身体扫描，不看屏幕');
addAct('low', 'actWaterOtherRoom', 'Drink water in another room', '去另一个房间喝水');
addAct('low', 'actOutsideBreath', 'Stand outside and take 10 breaths', '站在门外深呼吸 10 次');
addAct('low', 'actFloorSit', 'Sit on the floor instead of the chair 2 minutes', '坐地板 2 分钟，离开椅子');
addAct('low', 'actWarmMug', 'Heat a drink and hold the mug', '热杯热饮，捧着杯子歇一会儿');
addAct('low', 'actNoScreen3', 'No screens for 3 minutes', '3 分钟不看任何屏幕');
addAct('low', 'actShoesWalk', 'Put on shoes and walk to the door', '穿上鞋走到门口');
addAct('low', 'actMakeBed', 'Make the bed if you haven’t', '被子还没叠的话去叠一下');
addAct('low', 'actSlowYawnWalk', 'Walk until you yawn once', '走到打一个哈欠为止');

var ACTS = { high: [], mid: [], low: [] };
var ACT_BY_ID = {};
ACT_LIST.forEach((a) => {
  ACTS[a.stage].push(a.id);
  ACT_BY_ID[a.id] = a;
});
