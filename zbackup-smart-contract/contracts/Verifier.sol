// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16Verifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 1503269319140086162040077356948401257072823675534257832731870190081746304581;
    uint256 constant alphay  = 354933292509896480051346262594534699721926913856560665757705485884006521022;
    uint256 constant betax1  = 12795462034370533210665088380102276806419135453311385023275149419847493007701;
    uint256 constant betax2  = 11277492930183735990000253688954925593795007082713709950607060699496795904270;
    uint256 constant betay1  = 80118384899928618294262028000533413157761184290355368919311450264291740780;
    uint256 constant betay2  = 7237485854336739029714876782528102299622345306468941789797955178166084375489;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 12969991407989626694124553030053264004528570267967357980886009412821812578830;
    uint256 constant deltax2 = 10529972973594962816363799639751106715928187196466878412614997171826588861691;
    uint256 constant deltay1 = 7495327054345351050044287391512197670797550126713540277403025968807413347987;
    uint256 constant deltay2 = 5964256894260023731871090681036236012440000511111050557718553211025973951893;

    
    uint256 constant IC0x = 9816736818338126574268968310406323973708768569354804269729332008366016959194;
    uint256 constant IC0y = 8113337691381142065312819780377005129194846864137759029134823886369275342012;
    
    uint256 constant IC1x = 1320429676868834380045848025301836574500091739498668874870381557256081815883;
    uint256 constant IC1y = 13582748908063463577478674688365726173625871219604327201144615279171475925757;
    
    uint256 constant IC2x = 4676811606428034269974461220979799796010504595185645688430752780613618018042;
    uint256 constant IC2y = 8033333500089167105063112064795771700026583871628460731803377462632132686220;
    
    uint256 constant IC3x = 11538606612037777934802557480597377344304686020198493049736806581181483065212;
    uint256 constant IC3y = 19194175942191202069906759039562991518389008203697134889136974797920928664553;
    
    uint256 constant IC4x = 7847447210716901994505198129593968756895166171006147655131684358313154003503;
    uint256 constant IC4y = 14570105293218003264071269155001463525167374200553649851442959832513917927856;
    
    uint256 constant IC5x = 21719547757799783381621150802027355165473377865948543188597687340636045692291;
    uint256 constant IC5y = 4751280805904785915279287472602244167009202988163883832296198434769171940232;
    
    uint256 constant IC6x = 17893870719807279961285584986564291651609439504774519311036445941185674364560;
    uint256 constant IC6y = 15862674258322344361030557126248778849835852844616636924778550005613235667697;
    
    uint256 constant IC7x = 4085758519980791612396199114192670138707702256682851368455351238420390916964;
    uint256 constant IC7y = 9422861920087538671658317701032433032723528926491252981785397859627018337320;
    
    uint256 constant IC8x = 11742599944625276827446986396138369967789067970547501550135110362580357010688;
    uint256 constant IC8y = 7290715861285713002844409454349345772524232804833786088111408989338786286483;
    
    uint256 constant IC9x = 2781074061342022245430629404651326020905507879684871878350818080020308597993;
    uint256 constant IC9y = 19820363918924084175384749273189828279519760371035620517533836527929658424692;
    
    uint256 constant IC10x = 5221451942819987368534586049509919752153499344660190567734781905111719111309;
    uint256 constant IC10y = 18298039247158598903784370549066821769222943128643116063470110708901199278290;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[10] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
